use serde::Serialize;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::Duration;

#[derive(Serialize, Clone)]
pub struct ServerStatus {
    pub online: bool,
    pub players_online: i32,
    pub players_max: i32,
    pub motd: String,
    pub latency_ms: u64,
}

/// Ping a Minecraft server using the legacy ping protocol (simple, works for 1.7+).
#[tauri::command]
pub async fn ping_server(host: String, port: u16) -> Result<ServerStatus, String> {
    tokio::task::spawn_blocking(move || ping_server_sync(&host, port))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

fn ping_server_sync(host: &str, port: u16) -> Result<ServerStatus, String> {
    let addr = format!("{}:{}", host, port);
    let start = std::time::Instant::now();

    use std::net::ToSocketAddrs;
    let socket_addr = addr
        .to_socket_addrs()
        .map_err(|e| format!("DNS resolve failed: {}", e))?
        .next()
        .ok_or_else(|| "No addresses resolved".to_string())?;
    let mut stream = TcpStream::connect_timeout(&socket_addr, Duration::from_secs(5))
        .map_err(|e| format!("Connection failed: {}", e))?;

    stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .map_err(|e| format!("Set timeout failed: {}", e))?;

    // Build handshake packet (protocol version -1 = status, server address, port, next state 1)
    let mut handshake_data = Vec::new();
    handshake_data.push(0x00); // Packet ID: Handshake
    write_varint(&mut handshake_data, -1); // Protocol version (-1 for status ping)
    write_string(&mut handshake_data, host); // Server address
    handshake_data.extend_from_slice(&port.to_be_bytes()); // Port
    write_varint(&mut handshake_data, 1); // Next state: Status

    // Write handshake as length-prefixed packet
    let mut packet = Vec::new();
    write_varint(&mut packet, handshake_data.len() as i32);
    packet.extend_from_slice(&handshake_data);
    stream
        .write_all(&packet)
        .map_err(|e| format!("Write handshake failed: {}", e))?;

    // Send status request (packet ID 0x00, no fields)
    let mut status_req = Vec::new();
    write_varint(&mut status_req, 1); // length: 1 byte
    status_req.push(0x00); // Packet ID: Status Request
    stream
        .write_all(&status_req)
        .map_err(|e| format!("Write status request failed: {}", e))?;

    // Read response
    let _response_length = read_varint(&mut stream)?;
    let _packet_id = read_varint(&mut stream)?;
    let json_length = read_varint(&mut stream)?;

    if json_length <= 0 || json_length > 65535 {
        return Err("Invalid JSON response length".to_string());
    }

    let mut json_buf = vec![0u8; json_length as usize];
    stream
        .read_exact(&mut json_buf)
        .map_err(|e| format!("Read JSON failed: {}", e))?;

    let latency = start.elapsed().as_millis() as u64;

    let json_str = String::from_utf8(json_buf).map_err(|e| format!("UTF-8 error: {}", e))?;
    let json: serde_json::Value =
        serde_json::from_str(&json_str).map_err(|e| format!("JSON parse error: {}", e))?;

    let players = json.get("players");
    let players_online = players
        .and_then(|p| p.get("online"))
        .and_then(|v| v.as_i64())
        .unwrap_or(0) as i32;
    let players_max = players
        .and_then(|p| p.get("max"))
        .and_then(|v| v.as_i64())
        .unwrap_or(0) as i32;

    let motd = json
        .get("description")
        .map(|d| {
            if let Some(text) = d.as_str() {
                text.to_string()
            } else if let Some(text) = d.get("text").and_then(|t| t.as_str()) {
                text.to_string()
            } else {
                String::new()
            }
        })
        .unwrap_or_default();

    Ok(ServerStatus {
        online: true,
        players_online,
        players_max,
        motd,
        latency_ms: latency,
    })
}

fn write_varint(buf: &mut Vec<u8>, mut value: i32) {
    loop {
        let mut byte = (value & 0x7F) as u8;
        value = ((value as u32) >> 7) as i32;
        if value != 0 {
            byte |= 0x80;
        }
        buf.push(byte);
        if value == 0 {
            break;
        }
    }
}

fn write_string(buf: &mut Vec<u8>, s: &str) {
    write_varint(buf, s.len() as i32);
    buf.extend_from_slice(s.as_bytes());
}

fn read_varint<R: Read>(reader: &mut R) -> Result<i32, String> {
    let mut result: i32 = 0;
    let mut shift: u32 = 0;
    loop {
        let mut byte = [0u8; 1];
        reader
            .read_exact(&mut byte)
            .map_err(|e| format!("Read varint failed: {}", e))?;
        result |= ((byte[0] & 0x7F) as i32) << shift;
        if byte[0] & 0x80 == 0 {
            break;
        }
        shift += 7;
        if shift >= 32 {
            return Err("VarInt too big".to_string());
        }
    }
    Ok(result)
}

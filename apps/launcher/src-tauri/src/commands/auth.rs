use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};

const MS_CLIENT_ID: &str = "00000000402b5328";
const MS_AUTH_URL: &str = "https://login.live.com/oauth20_authorize.srf";
const MS_TOKEN_URL: &str = "https://login.live.com/oauth20_token.srf";
const XBOX_AUTH_URL: &str = "https://user.auth.xboxlive.com/user/authenticate";
const XSTS_AUTH_URL: &str = "https://xsts.auth.xboxlive.com/xsts/authorize";
const MC_AUTH_URL: &str = "https://api.minecraftservices.com/authentication/login_with_xbox";
const MC_PROFILE_URL: &str = "https://api.minecraftservices.com/minecraft/profile";

#[derive(Serialize, Deserialize, Clone)]
pub struct MinecraftProfile {
    pub id: String,
    pub name: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct AuthTokens {
    pub ms_access_token: String,
    pub ms_refresh_token: String,
    pub mc_access_token: String,
    pub profile: MinecraftProfile,
}

#[derive(Deserialize)]
struct MsTokenResponse {
    access_token: String,
    refresh_token: String,
}

#[derive(Deserialize)]
struct XboxAuthResponse {
    #[serde(rename = "Token")]
    token: String,
    #[serde(rename = "DisplayClaims")]
    display_claims: DisplayClaims,
}

#[derive(Deserialize)]
struct DisplayClaims {
    xui: Vec<XuiEntry>,
}

#[derive(Deserialize)]
struct XuiEntry {
    uhs: String,
}

#[derive(Deserialize)]
struct McAuthResponse {
    access_token: String,
}

#[derive(Deserialize)]
struct McProfileResponse {
    id: String,
    name: String,
}

const MS_REDIRECT_URI: &str = "https://login.live.com/oauth20_desktop.srf";

/// Start MS OAuth: opens an in-app WebviewWindow and intercepts the redirect to extract the auth code.
#[tauri::command]
pub async fn microsoft_auth_start(app: tauri::AppHandle) -> Result<(), String> {
    let auth_url = format!(
        "{}?client_id={}&response_type=code&redirect_uri={}&scope=XboxLive.signin%20offline_access",
        MS_AUTH_URL, MS_CLIENT_ID, MS_REDIRECT_URI
    );

    let app_clone = app.clone();
    tauri::WebviewWindowBuilder::new(&app, "auth", tauri::WebviewUrl::External(auth_url.parse().map_err(|e| format!("Invalid URL: {}", e))?))
        .title("Microsoft 로그인")
        .inner_size(500.0, 700.0)
        .on_navigation(move |url| {
            if url.as_str().starts_with(MS_REDIRECT_URI) {
                let code = url
                    .query_pairs()
                    .find(|(k, _)| k == "code")
                    .map(|(_, v)| v.into_owned());

                if let Some(code) = code {
                    let _ = app_clone.emit("auth_code", code);
                    if let Some(win) = app_clone.get_webview_window("auth") {
                        let _ = win.close();
                    }
                }
                return false;
            }
            true
        })
        .build()
        .map_err(|e| format!("Failed to open auth window: {}", e))?;

    Ok(())
}

/// Exchange authorization code for full MC auth tokens.
#[tauri::command]
pub async fn exchange_auth_code(code: String, port: u16) -> Result<AuthTokens, String> {
    let redirect_uri = MS_REDIRECT_URI.to_string();
    let client = reqwest::Client::new();

    // Step 1: Exchange code for MS tokens
    let ms_tokens = client
        .post(MS_TOKEN_URL)
        .form(&[
            ("client_id", MS_CLIENT_ID),
            ("code", &code),
            ("grant_type", "authorization_code"),
            ("redirect_uri", &redirect_uri),
            ("scope", "XboxLive.signin offline_access"),
        ])
        .send()
        .await
        .map_err(|e| format!("MS token request failed: {}", e))?
        .json::<MsTokenResponse>()
        .await
        .map_err(|e| format!("MS token parse failed: {}", e))?;

    // Steps 2-5: Complete the auth chain
    let tokens = complete_auth_chain(&client, &ms_tokens.access_token, &ms_tokens.refresh_token).await?;
    Ok(tokens)
}

/// Refresh tokens using the MS refresh token.
#[tauri::command]
pub async fn refresh_token(refresh_token: String) -> Result<AuthTokens, String> {
    let client = reqwest::Client::new();

    let ms_tokens = client
        .post(MS_TOKEN_URL)
        .form(&[
            ("client_id", MS_CLIENT_ID),
            ("refresh_token", &refresh_token),
            ("grant_type", "refresh_token"),
            ("scope", "XboxLive.signin offline_access"),
        ])
        .send()
        .await
        .map_err(|e| format!("MS refresh failed: {}", e))?
        .json::<MsTokenResponse>()
        .await
        .map_err(|e| format!("MS refresh parse failed: {}", e))?;

    complete_auth_chain(&client, &ms_tokens.access_token, &ms_tokens.refresh_token).await
}

/// Get Minecraft profile using an existing MC access token.
#[tauri::command]
pub async fn get_minecraft_profile(mc_access_token: String) -> Result<MinecraftProfile, String> {
    let client = reqwest::Client::new();
    let profile = client
        .get(MC_PROFILE_URL)
        .bearer_auth(&mc_access_token)
        .send()
        .await
        .map_err(|e| format!("Profile request failed: {}", e))?
        .json::<McProfileResponse>()
        .await
        .map_err(|e| format!("Profile parse failed: {}", e))?;

    Ok(MinecraftProfile {
        id: profile.id,
        name: profile.name,
    })
}

async fn complete_auth_chain(
    client: &reqwest::Client,
    ms_access_token: &str,
    ms_refresh_token: &str,
) -> Result<AuthTokens, String> {
    // Step 2: Xbox Live auth
    let xbox_body = serde_json::json!({
        "Properties": {
            "AuthMethod": "RPS",
            "SiteName": "user.auth.xboxlive.com",
            "RpsTicket": format!("d={}", ms_access_token)
        },
        "RelyingParty": "http://auth.xboxlive.com",
        "TokenType": "JWT"
    });

    let xbox_resp = client
        .post(XBOX_AUTH_URL)
        .json(&xbox_body)
        .send()
        .await
        .map_err(|e| format!("Xbox auth failed: {}", e))?
        .json::<XboxAuthResponse>()
        .await
        .map_err(|e| format!("Xbox auth parse failed: {}", e))?;

    let xbox_token = xbox_resp.token;
    let user_hash = xbox_resp
        .display_claims
        .xui
        .first()
        .map(|x| x.uhs.clone())
        .ok_or("No user hash in Xbox response")?;

    // Step 3: XSTS auth
    let xsts_body = serde_json::json!({
        "Properties": {
            "SandboxId": "RETAIL",
            "UserTokens": [xbox_token]
        },
        "RelyingParty": "rp://api.minecraftservices.com/",
        "TokenType": "JWT"
    });

    let xsts_resp = client
        .post(XSTS_AUTH_URL)
        .json(&xsts_body)
        .send()
        .await
        .map_err(|e| format!("XSTS auth failed: {}", e))?
        .json::<XboxAuthResponse>()
        .await
        .map_err(|e| format!("XSTS auth parse failed: {}", e))?;

    let xsts_token = xsts_resp.token;

    // Step 4: Minecraft auth
    let mc_body = serde_json::json!({
        "identityToken": format!("XBL3.0 x={};{}", user_hash, xsts_token)
    });

    let mc_resp = client
        .post(MC_AUTH_URL)
        .json(&mc_body)
        .send()
        .await
        .map_err(|e| format!("MC auth failed: {}", e))?
        .json::<McAuthResponse>()
        .await
        .map_err(|e| format!("MC auth parse failed: {}", e))?;

    let mc_access_token = mc_resp.access_token;

    // Step 5: Get profile
    let profile = client
        .get(MC_PROFILE_URL)
        .bearer_auth(&mc_access_token)
        .send()
        .await
        .map_err(|e| format!("Profile request failed: {}", e))?
        .json::<McProfileResponse>()
        .await
        .map_err(|e| format!("Profile parse failed: {}", e))?;

    Ok(AuthTokens {
        ms_access_token: ms_access_token.to_string(),
        ms_refresh_token: ms_refresh_token.to_string(),
        mc_access_token,
        profile: MinecraftProfile {
            id: profile.id,
            name: profile.name,
        },
    })
}

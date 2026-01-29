export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-bangul py-20">
      <div className="mx-auto max-w-3xl px-4">
        <h1 className="text-3xl font-bold font-bangul text-[color:var(--fg)] mb-8">
          개인정보 처리방침
        </h1>

        <div className="rounded-3xl card-glass p-8 space-y-8">
          <section>
            <h2 className="text-xl font-bold text-[color:var(--fg)] mb-4">1. 수집하는 개인정보</h2>
            <ul className="list-disc pl-6 space-y-3 text-[color:var(--muted)]">
              <li>Discord 사용자 정보 (닉네임, 아바타, ID)</li>
              <li>보유 포인트 및 아이템 정보</li>
              <li>길드/서버 가입 기록</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[color:var(--fg)] mb-4">2. 개인정보의 이용 목적</h2>
            <ul className="list-disc pl-6 space-y-3 text-[color:var(--muted)]">
              <li>사용자 인증 및 계정 관리</li>
              <li>뽑기 기능 및 아이템 획득</li>
              <li>길드 및 아이템 관리</li>
              <li>서비스 이용 기록</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[color:var(--fg)] mb-4">3. 개인정보의 보관 및 공유</h2>
            <ul className="list-disc pl-6 space-y-3 text-[color:var(--muted)]">
              <li>개인정보는 Discord에 안전하게 저장되며 비밀로 관리됩니다.</li>
              <li>제3자에게 개인정보가 공유되지 않습니다.</li>
              <li>서버 운영자는 개인정보에 엑세스할 수 있으나, 이는 기술적 문제 해결 목적으로만 사용됩니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[color:var(--fg)] mb-4">4. 개인정보의 파기</h2>
            <ul className="list-disc pl-6 space-y-3 text-[color:var(--muted)]">
              <li>사용자가 탈퇴 또는 계정 삭제를 요청하는 경우, 개인정보는 30일 후 삭제됩니다.</li>
              <li>개인정보 삭제 요청은 Discord 채널을 통해 처리됩니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[color:var(--fg)] mb-4">5. 문의</h2>
            <ul className="list-disc pl-6 space-y-3 text-[color:var(--muted)]">
              <li>개인정보와 관련된 문의는 관리자에게 문의해주세요.</li>
              <li>문의는 서버 내 문의 기능 또는 Discord를 통해 가능합니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[color:var(--fg)] mb-4">6. 약관의 적용</h2>
            <ul className="list-disc pl-6 space-y-3 text-[color:var(--muted)]">
              <li>이 약관은 서비스 전체에 적용됩니다.</li>
              <li>서비스 이용 시 본 약관에 동의한 것으로 간주됩니다.</li>
            </ul>
          </section>
        </div>
      </div>
    </main>
  );
}

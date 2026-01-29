export default function TermsPage() {
  return (
    <main className="min-h-screen bg-bangul py-20">
      <div className="mx-auto max-w-3xl px-4">
        <h1 className="text-3xl font-bold font-bangul text-[color:var(--fg)] mb-8">
          이용약관
        </h1>

        <div className="rounded-3xl card-glass p-8 space-y-8 text-[color:var(--muted)]">
          <section>
            <h2 className="text-lg font-bold text-[color:var(--fg)] mb-4">1. 회원가입 및 계정</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Discord 계정을 통하여 회원가입이 가능합니다.
              </li>
              <li>
                서비스 이용 중 계정 정보는 Discord에 따릅니다.
              </li>
              <li>
                서비스 이용을 중단하려면 Discord 연동을 해제해주세요.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[color:var(--fg)] mb-4">2. 서비스 이용</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                본 서비스는 Discord 봇과의 자동 반응 기능을 제공합니다.
              </li>
              <li>
                서비스 이용은 무료이나, 일부 기능에서 포인트 소모가 필요할 수 있습니다.
              </li>
              <li>
                포인트는 서버 활동 참여 등을 통해 획득할 수 있습니다.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[color:var(--fg)] mb-4">3. 포인트 및 아이템</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                획득한 포인트는 뽑기 기능에서 아이템 획득에 사용할 수 있습니다.
              </li>
              <li>
                아이템은 레어티(R, S, SS, SSS)에 따라 획과가 다릅니다.
              </li>
              <li>
                아이템은 계정 연동 상태 유지 조건 하에서만 사용할 수 있습니다.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[color:var(--fg)] mb-4">4. 이용 제한</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                서비스 이용 중 발생하는 모든 활동 로그는 기록됩니다.
              </li>
              <li>
                악용, 버그 악용, 부정한 행위는 이용 정지 사유가 됩니다.
              </li>
              <li>
                서비스 운영자는 이용 약관을 위반하는 사용자에 대해 제재 조치를 취할 수 있습니다.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[color:var(--fg)] mb-4">5. 약관의 변경</h2>
            <p>
              서비스 운영자는 본 약관을 사전 고지 없이 변경할 수 있습니다.
              변경 사항은 공지사항을 통해 안내됩니다.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}

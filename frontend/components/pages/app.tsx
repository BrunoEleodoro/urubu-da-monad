'use client'

export default function Home() {
  return (
    <main
      className="min-h-[100dvh] bg-[#0e0e1a]"
      style={{
        paddingTop: 'max(env(safe-area-inset-top), 0px)',
        paddingRight: 'max(env(safe-area-inset-right), 0px)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 0px)',
        paddingLeft: 'max(env(safe-area-inset-left), 0px)',
      }}
    >
      <iframe
        title="Urubu do Nomad"
        src="/game/index.html"
        className="block h-[100dvh] w-full border-0"
        style={{
          height:
            'calc(100dvh - max(env(safe-area-inset-top), 0px) - max(env(safe-area-inset-bottom), 0px))',
        }}
      />
    </main>
  )
}

export default function AuthStage() {
  return (
    <div className="stage" aria-hidden="true">
      <img className="stage__photo" src="/espalda.png" alt="" />
      <svg
        className="stage__smoke"
        viewBox="0 0 600 900"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5">
          <path d="M-40 210 C 120 150, 200 300, 140 410 S 60 620, 220 690 S 420 700, 360 540" />
          <path d="M10 120 C 180 90, 250 250, 180 360 S 90 560, 250 650 S 470 660, 410 470" />
          <path d="M-60 330 C 110 280, 180 420, 110 520 S 30 700, 200 770" />
          <path d="M80 40 C 240 30, 320 190, 250 300 S 150 500, 320 590 S 540 600, 470 400" />
          <path d="M-20 470 C 140 440, 210 560, 150 650 S 70 820, 240 880" />
        </g>
      </svg>
    </div>
  )
}

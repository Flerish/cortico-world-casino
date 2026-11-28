/** 花札 48 张 SVG 牌面资产(由 scripts/build-hanafuda-svg.mjs 从主人定稿的
 *  花札牌面-SVG全套48张.html 生成;勿手改产物,改源头后重跑脚本)。
 *  viewBox 120x200;DEFS 每个面板根注入一次,hanafudaCardSvg 按牌渲染。 */

export const HANAFUDA_SVG_DEFS = `<svg width="0" height="0" style="position:absolute">
  <symbol id="g-light" viewBox="0 0 120 200">
    <rect x="7" y="7" width="106" height="186" fill="none" stroke="#e8c766" stroke-width="1.6" rx="4"/>
    <rect x="10.5" y="10.5" width="99" height="179" fill="none" stroke="#e8c766" stroke-width="0.8" opacity=".65" rx="3"/>
    <circle cx="103" cy="16" r="9" fill="#e8c766" stroke="#8a6a20" stroke-width="1"/>
    <text x="103" y="19.6" font-size="10" fill="#3a2a10" text-anchor="middle" font-family="serif" font-weight="700">光</text>
  </symbol><defs>
  <clipPath id="inner"><rect x="4" y="4" width="112" height="192" rx="2"/></clipPath>
  <linearGradient id="night" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b2338"/><stop offset="1" stop-color="#3c3a2c"/></linearGradient>
  <radialGradient id="moong" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#fdf8e6"/><stop offset="1" stop-color="#e6d9ae"/></radialGradient>
  <linearGradient id="water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fc4d8"/><stop offset="1" stop-color="#6f9cb8"/></linearGradient>

  <!-- ============ 植物 ============ -->
  <symbol id="p-pine" viewBox="0 0 120 200">
    <path d="M108 196C98 152 92 122 78 98 70 84 58 76 44 72" stroke="#5a3a1e" stroke-width="7" fill="none"/>
    <path d="M78 98C88 90 98 86 110 84" stroke="#5a3a1e" stroke-width="4.5" fill="none"/>
    <g fill="#1f6b3a"><ellipse cx="40" cy="68" rx="24" ry="11"/><ellipse cx="62" cy="60" rx="20" ry="9"/><ellipse cx="106" cy="80" rx="18" ry="9"/><ellipse cx="88" cy="94" rx="16" ry="8"/><ellipse cx="22" cy="82" rx="16" ry="8"/></g>
    <g fill="#2f8a4c" opacity=".85"><ellipse cx="44" cy="64" rx="16" ry="6"/><ellipse cx="102" cy="76" rx="12" ry="5"/></g>
    <path d="M4 188Q60 178 116 188L116 196 4 196Z" fill="#7d9a5a"/>
  </symbol>

  <symbol id="p-plum" viewBox="0 0 120 200">
    <path d="M8 196C22 158 32 128 50 106 64 88 84 76 106 68" stroke="#5a3a1e" stroke-width="5.5" fill="none"/>
    <path d="M50 106C38 98 28 94 16 92M74 84C70 70 68 60 70 48" stroke="#5a3a1e" stroke-width="3.5" fill="none"/>
    <g fill="#d94a6a"><circle cx="18" cy="90" r="8"/><circle cx="36" cy="102" r="7"/><circle cx="70" cy="46" r="8.5"/><circle cx="90" cy="72" r="7.5"/><circle cx="106" cy="64" r="7"/><circle cx="56" cy="96" r="6"/></g>
    <g fill="#f7c3ce"><circle cx="18" cy="90" r="4"/><circle cx="36" cy="102" r="3.5"/><circle cx="70" cy="46" r="4.2"/><circle cx="90" cy="72" r="3.8"/><circle cx="106" cy="64" r="3.5"/><circle cx="56" cy="96" r="3"/></g>
    <path d="M4 190Q60 182 116 190L116 196 4 196Z" fill="#8aa860"/>
  </symbol>

  <symbol id="p-cherry" viewBox="0 0 120 200">
    <path d="M4 44C30 38 52 48 74 38 92 30 104 34 116 28" stroke="#6b4a2e" stroke-width="4" fill="none"/>
    <path d="M40 44C36 60 34 72 36 84M88 34C92 50 94 62 92 74" stroke="#6b4a2e" stroke-width="2.6" fill="none"/>
    <g fill="#f2a8c0"><circle cx="18" cy="34" r="9"/><circle cx="42" cy="46" r="10"/><circle cx="66" cy="32" r="9"/><circle cx="94" cy="38" r="10"/><circle cx="112" cy="24" r="8"/><circle cx="34" cy="86" r="7.5"/><circle cx="92" cy="76" r="7"/></g>
    <g fill="#fbd3e0"><circle cx="18" cy="34" r="5"/><circle cx="42" cy="46" r="5.5"/><circle cx="66" cy="32" r="5"/><circle cx="94" cy="38" r="5.5"/><circle cx="112" cy="24" r="4.5"/><circle cx="34" cy="86" r="4"/><circle cx="92" cy="76" r="3.8"/></g>
    <g fill="#d4557c"><circle cx="18" cy="34" r="1.6"/><circle cx="42" cy="46" r="1.8"/><circle cx="66" cy="32" r="1.6"/><circle cx="94" cy="38" r="1.8"/></g>
    <path d="M4 188Q60 180 116 188L116 196 4 196Z" fill="#8aa860"/>
  </symbol>

  <symbol id="p-wisteria" viewBox="0 0 120 200">
    <path d="M4 30C34 22 62 32 92 24 104 20 112 22 116 20" stroke="#6b4a2e" stroke-width="4" fill="none"/>
    <g fill="#3d7a42"><ellipse cx="24" cy="24" rx="13" ry="6"/><ellipse cx="70" cy="28" rx="13" ry="6"/><ellipse cx="104" cy="20" rx="10" ry="5"/></g>
    <g fill="#8f6fc4">
      <g><circle cx="26" cy="46" r="6"/><circle cx="26" cy="60" r="5.5"/><circle cx="26" cy="73" r="5"/><circle cx="26" cy="85" r="4.2"/><circle cx="26" cy="96" r="3.4"/><circle cx="26" cy="105" r="2.6"/></g>
      <g><circle cx="58" cy="52" r="6.5"/><circle cx="58" cy="67" r="6"/><circle cx="58" cy="81" r="5.4"/><circle cx="58" cy="94" r="4.6"/><circle cx="58" cy="106" r="3.6"/><circle cx="58" cy="116" r="2.8"/></g>
      <g><circle cx="90" cy="44" r="6"/><circle cx="90" cy="58" r="5.5"/><circle cx="90" cy="71" r="4.8"/><circle cx="90" cy="83" r="4"/><circle cx="90" cy="93" r="3.2"/></g>
    </g>
    <g fill="#c3aee0" opacity=".8"><circle cx="24" cy="44" r="2.6"/><circle cx="56" cy="50" r="2.8"/><circle cx="88" cy="42" r="2.6"/><circle cx="56" cy="65" r="2.4"/></g>
    <path d="M4 190Q60 184 116 190L116 196 4 196Z" fill="#7fa05e"/>
  </symbol>

  <symbol id="p-iris" viewBox="0 0 120 200">
    <g stroke="#3d7a42" stroke-width="4" fill="none"><path d="M30 196C28 150 32 116 40 86"/><path d="M58 196C58 152 56 120 52 92"/><path d="M86 196C88 154 84 122 76 96"/></g>
    <g fill="#4f8a4a"><path d="M14 196C20 160 28 140 34 128 30 158 24 180 20 196Z"/><path d="M104 196C98 162 90 142 84 130 88 160 94 180 98 196Z"/></g>
    <g fill="#6b4a9e"><path d="M40 86C28 74 26 58 38 52 48 48 54 60 50 74Z"/><path d="M40 86C52 76 66 74 68 84 70 94 54 96 44 92Z"/><path d="M40 86C30 96 18 98 16 88 14 78 28 76 38 80Z"/></g>
    <g fill="#8f6fc4" opacity=".85"><path d="M40 80C34 70 34 60 40 56 46 60 46 72 42 80Z"/></g>
    <circle cx="40" cy="84" r="3.4" fill="#e8c766"/>
    <g fill="#6b4a9e" transform="translate(38 24) scale(.78)"><path d="M40 86C28 74 26 58 38 52 48 48 54 60 50 74Z"/><path d="M40 86C52 76 66 74 68 84 70 94 54 96 44 92Z"/><path d="M40 86C30 96 18 98 16 88 14 78 28 76 38 80Z"/></g>
    <circle cx="69" cy="91" r="2.6" fill="#e8c766"/>
    <path d="M4 190Q60 184 116 190L116 196 4 196Z" fill="#7fa05e"/>
  </symbol>

  <symbol id="p-peony" viewBox="0 0 120 200">
    <g fill="#2f7a3f"><path d="M14 178C26 158 40 152 52 158 40 172 26 180 14 178Z"/><path d="M106 176C94 156 80 150 68 156 80 170 94 178 106 176Z"/><path d="M20 130C32 116 44 114 54 120 42 132 30 136 20 130Z"/></g>
    <g fill="#b8283c"><circle cx="42" cy="146" r="27"/><circle cx="86" cy="112" r="21"/></g>
    <g fill="#d94a56"><circle cx="42" cy="146" r="20"/><circle cx="86" cy="112" r="15"/></g>
    <g fill="#ef7b81"><circle cx="42" cy="146" r="12.5"/><circle cx="86" cy="112" r="9.5"/></g>
    <g fill="#f9c9c6"><circle cx="42" cy="146" r="5.5"/><circle cx="86" cy="112" r="4"/></g>
    <g stroke="#8e1f2e" stroke-width="1" fill="none" opacity=".6"><path d="M42 119L42 173M15 146L69 146M23 127L61 165M61 127L23 165"/></g>
    <path d="M4 190Q60 184 116 190L116 196 4 196Z" fill="#7fa05e"/>
  </symbol>

  <symbol id="p-hagi" viewBox="0 0 120 200">
    <g stroke="#4f7a3a" stroke-width="2.6" fill="none"><path d="M20 196C24 160 34 130 52 108"/><path d="M56 196C58 158 62 128 74 104"/><path d="M92 196C90 162 84 134 70 112"/></g>
    <g fill="#3d7a42"><ellipse cx="34" cy="140" rx="9" ry="5" transform="rotate(-25 34 140)"/><ellipse cx="64" cy="132" rx="9" ry="5" transform="rotate(20 64 132)"/><ellipse cx="82" cy="150" rx="8" ry="4.5" transform="rotate(-15 82 150)"/></g>
    <g fill="#b06fa8">
      <circle cx="52" cy="106" r="5"/><circle cx="44" cy="116" r="4.5"/><circle cx="58" cy="118" r="4.2"/><circle cx="48" cy="128" r="4"/>
      <circle cx="74" cy="102" r="5"/><circle cx="66" cy="112" r="4.5"/><circle cx="80" cy="114" r="4.2"/><circle cx="70" cy="124" r="4"/>
      <circle cx="70" cy="110" r="4"/><circle cx="36" cy="126" r="3.6"/>
    </g>
    <g fill="#e0b4d8" opacity=".85"><circle cx="51" cy="104" r="2.2"/><circle cx="73" cy="100" r="2.2"/><circle cx="45" cy="115" r="1.8"/></g>
    <path d="M4 190Q60 182 116 190L116 196 4 196Z" fill="#8aa860"/>
  </symbol>

  <symbol id="p-susuki" viewBox="0 0 120 200">
    <g stroke="#c9c39a" stroke-width="1.6" fill="none"><path d="M18 196C20 168 22 150 26 132"/><path d="M34 196C34 170 32 150 30 128"/><path d="M52 196C54 166 58 146 64 126"/><path d="M70 196C70 170 68 152 66 132"/><path d="M88 196C90 168 94 148 100 130"/><path d="M104 196C104 172 102 154 100 136"/></g>
    <g fill="#e8e2c0"><ellipse cx="26" cy="126" rx="4" ry="11" transform="rotate(-8 26 126)"/><ellipse cx="30" cy="122" rx="4" ry="11" transform="rotate(6 30 122)"/><ellipse cx="64" cy="120" rx="4.5" ry="12" transform="rotate(-10 64 120)"/><ellipse cx="66" cy="126" rx="4" ry="10" transform="rotate(8 66 126)"/><ellipse cx="100" cy="124" rx="4" ry="11" transform="rotate(-6 100 124)"/><ellipse cx="100" cy="130" rx="3.6" ry="9" transform="rotate(10 100 130)"/></g>
    <path d="M4 186Q60 176 116 186L116 196 4 196Z" fill="#6b7a4a"/>
  </symbol>

  <symbol id="p-kiku" viewBox="0 0 120 200">
    <g fill="#3d7a42"><path d="M10 186C24 168 38 164 48 170 36 182 22 188 10 186Z"/><path d="M110 184C96 166 82 162 72 168 84 180 98 186 110 184Z"/></g>
    <g id="mum" fill="#e8b93c"><ellipse cx="0" cy="-16" rx="5" ry="12"/></g>
    <g fill="#e8b93c" transform="translate(36 66)">
      <use href="#mum"/><use href="#mum" transform="rotate(30)"/><use href="#mum" transform="rotate(60)"/><use href="#mum" transform="rotate(90)"/><use href="#mum" transform="rotate(120)"/><use href="#mum" transform="rotate(150)"/><use href="#mum" transform="rotate(180)"/><use href="#mum" transform="rotate(210)"/><use href="#mum" transform="rotate(240)"/><use href="#mum" transform="rotate(270)"/><use href="#mum" transform="rotate(300)"/><use href="#mum" transform="rotate(330)"/>
    </g>
    <circle cx="36" cy="66" r="8" fill="#f7e6a8"/>
    <g fill="#e8b93c" transform="translate(88 96) scale(.8)">
      <use href="#mum"/><use href="#mum" transform="rotate(30)"/><use href="#mum" transform="rotate(60)"/><use href="#mum" transform="rotate(90)"/><use href="#mum" transform="rotate(120)"/><use href="#mum" transform="rotate(150)"/><use href="#mum" transform="rotate(180)"/><use href="#mum" transform="rotate(210)"/><use href="#mum" transform="rotate(240)"/><use href="#mum" transform="rotate(270)"/><use href="#mum" transform="rotate(300)"/><use href="#mum" transform="rotate(330)"/>
    </g>
    <circle cx="88" cy="96" r="6.4" fill="#f7e6a8"/>
    <path d="M4 190Q60 184 116 190L116 196 4 196Z" fill="#7fa05e"/>
  </symbol>

  <symbol id="p-momiji" viewBox="0 0 120 200">
    <path d="M8 196C24 162 36 132 54 112 68 96 88 84 108 76" stroke="#6b4a2e" stroke-width="4.5" fill="none"/>
    <g id="leaf"><path d="M0 0L-4 -8L-10 -6L-7 -13L-14 -14L-8 -18L-11 -24L-4 -21L0 -28L4 -21L11 -24L8 -18L14 -14L7 -13L10 -6L4 -8Z"/></g>
    <g fill="#c8342b"><use href="#leaf" transform="translate(26 96) scale(1.05) rotate(-15)"/><use href="#leaf" transform="translate(62 78) scale(1.15) rotate(10)"/><use href="#leaf" transform="translate(98 66) scale(.95) rotate(-8)"/></g>
    <g fill="#e8663c"><use href="#leaf" transform="translate(44 124) scale(.9) rotate(25)"/><use href="#leaf" transform="translate(84 104) scale(.85) rotate(-20)"/><use href="#leaf" transform="translate(16 130) scale(.8) rotate(5)"/></g>
    <g fill="#e8a33c" opacity=".9"><use href="#leaf" transform="translate(70 140) scale(.75) rotate(-30)"/><use href="#leaf" transform="translate(104 128) scale(.7) rotate(15)"/></g>
    <path d="M4 190Q60 182 116 190L116 196 4 196Z" fill="#8a9a52"/>
  </symbol>

  <symbol id="p-yanagi" viewBox="0 0 120 200">
    <path d="M100 196C96 150 92 110 84 76 78 52 68 34 56 22" stroke="#5a4a2e" stroke-width="6" fill="none"/>
    <g stroke="#4f8a4a" stroke-width="2" fill="none">
      <path d="M56 22C40 30 28 46 22 70 18 90 18 112 20 134"/><path d="M64 30C52 42 44 60 40 84 37 104 38 124 40 144"/>
      <path d="M76 44C68 58 62 78 60 100 58 120 60 138 62 156"/><path d="M84 60C80 76 78 96 78 116 78 134 80 150 82 164"/>
      <path d="M40 26C28 36 18 52 14 74 11 92 12 112 14 130"/>
    </g>
    <g fill="#6faa5a">
      <ellipse cx="20" cy="80" rx="3" ry="7"/><ellipse cx="22" cy="104" rx="3" ry="7"/><ellipse cx="40" cy="94" rx="3" ry="7"/><ellipse cx="40" cy="120" rx="3" ry="7"/>
      <ellipse cx="60" cy="110" rx="3" ry="7"/><ellipse cx="62" cy="136" rx="3" ry="7"/><ellipse cx="78" cy="126" rx="3" ry="7"/><ellipse cx="14" cy="96" rx="3" ry="7"/>
    </g>
    <path d="M4 188Q60 180 116 188L116 196 4 196Z" fill="#7d9a5a"/>
  </symbol>

  <symbol id="p-kiri" viewBox="0 0 120 200">
    <path d="M60 196C58 160 56 130 54 104" stroke="#5a4a2e" stroke-width="5" fill="none"/>
    <g fill="#2f7a3f">
      <path d="M54 128C36 122 22 130 20 144 34 152 50 146 54 134Z"/>
      <path d="M56 128C74 122 90 130 92 144 78 152 62 146 56 134Z"/>
      <path d="M54 158C40 154 28 160 26 172 38 178 50 172 54 164Z"/>
      <path d="M58 158C72 154 84 160 86 172 74 178 62 172 58 164Z"/>
    </g>
    <g fill="#8f6fc4">
      <g transform="translate(34 60)"><ellipse cx="0" cy="0" rx="7" ry="10"/><ellipse cx="-8" cy="12" rx="6" ry="9"/><ellipse cx="8" cy="12" rx="6" ry="9"/><ellipse cx="0" cy="24" rx="6.5" ry="9"/><ellipse cx="0" cy="36" rx="5" ry="7"/></g>
      <g transform="translate(62 44)"><ellipse cx="0" cy="0" rx="7.5" ry="11"/><ellipse cx="-9" cy="13" rx="6.5" ry="10"/><ellipse cx="9" cy="13" rx="6.5" ry="10"/><ellipse cx="0" cy="26" rx="7" ry="10"/><ellipse cx="0" cy="39" rx="5.5" ry="8"/><ellipse cx="0" cy="50" rx="4" ry="6"/></g>
      <g transform="translate(90 64)"><ellipse cx="0" cy="0" rx="6.5" ry="9"/><ellipse cx="-7" cy="11" rx="5.5" ry="8"/><ellipse cx="7" cy="11" rx="5.5" ry="8"/><ellipse cx="0" cy="22" rx="6" ry="8"/><ellipse cx="0" cy="33" rx="4.5" ry="6"/></g>
    </g>
    <g fill="#c3aee0" opacity=".75"><ellipse cx="34" cy="57" rx="3" ry="4"/><ellipse cx="62" cy="41" rx="3.2" ry="4.5"/><ellipse cx="90" cy="61" rx="2.8" ry="3.8"/></g>
    <path d="M4 190Q60 184 116 190L116 196 4 196Z" fill="#7fa05e"/>
  </symbol>

  <!-- ============ 光 ============ -->
  <symbol id="e-crane" viewBox="0 0 120 200">
    <circle cx="26" cy="30" r="20" fill="#c8342b"/>
    <path d="M52 168C46 148 50 132 62 126 74 120 86 126 88 138 90 152 82 166 70 170Z" fill="#fbf7ee"/>
    <path d="M70 170C82 166 90 154 88 140 96 150 96 166 84 174Z" fill="#1a1a1a"/>
    <path d="M62 126C58 112 60 100 66 94" stroke="#fbf7ee" stroke-width="7" fill="none" stroke-linecap="round"/>
    <circle cx="67" cy="91" r="6.5" fill="#fbf7ee"/><circle cx="67" cy="87" r="3.4" fill="#c8342b"/>
    <path d="M72 91L84 89L72 95Z" fill="#3a3226"/><circle cx="69.5" cy="91" r="1.1" fill="#1a1a1a"/>
    <path d="M60 170L58 190M70 172L72 190" stroke="#3a3226" stroke-width="2.6"/>
    <path d="M50 190L64 190M66 190L80 190" stroke="#3a3226" stroke-width="2.2"/>
    <path d="M64 132C58 136 54 142 52 150" stroke="#1a1a1a" stroke-width="2" fill="none" opacity=".75"/>
    <path d="M70 140C64 146 60 152 58 160" stroke="#1a1a1a" stroke-width="1.8" fill="none" opacity=".6"/>
    <path d="M74 148C70 156 66 162 62 168" stroke="#3a3226" stroke-width="1.6" fill="none" opacity=".6"/>
    <path d="M56 150C54 144 56 138 62 134 66 132 70 132 74 134" stroke="#d8d2c2" stroke-width="3" fill="none" opacity=".8"/>
    <ellipse cx="30" cy="188" rx="12" ry="3" fill="#7d9a5a" opacity=".85"/>
    <ellipse cx="88" cy="190" rx="10" ry="2.6" fill="#7d9a5a" opacity=".7"/>
    <g stroke="#5a7a3a" stroke-width="1.4" opacity=".8" fill="none"><path d="M24 188C24 184 26 182 28 181M32 188C32 184 31 181 30 180M86 190C86 186 88 184 89 183M92 190C92 186 91 184 90 183"/></g>
  </symbol>

  <symbol id="e-curtain" viewBox="0 0 120 200">
    <rect x="8" y="96" width="104" height="9" fill="#2b2b2b"/>
    <g><rect x="8" y="105" width="17" height="66" fill="#f7f3ea"/><rect x="25" y="105" width="17" height="66" fill="#c8342b"/><rect x="42" y="105" width="17" height="66" fill="#f7f3ea"/><rect x="59" y="105" width="17" height="66" fill="#c8342b"/><rect x="76" y="105" width="17" height="66" fill="#f7f3ea"/><rect x="93" y="105" width="19" height="66" fill="#c8342b"/></g>
    <rect x="8" y="126" width="104" height="7" fill="#2b2b2b"/><rect x="8" y="154" width="104" height="7" fill="#2b2b2b"/>
    <g fill="#e8c766"><circle cx="33.5" cy="116" r="4.2"/><circle cx="67.5" cy="116" r="4.2"/><circle cx="102" cy="116" r="4.2"/></g>
    <path d="M8 171L112 171L112 178Q60 186 8 178Z" fill="#2b2b2b"/>
    <g stroke="#1a1a1a" stroke-width="1.2" opacity=".14"><path d="M25 105L25 171M42 105L42 171M59 105L59 171M76 105L76 171M93 105L93 171"/></g>
    <g fill="#fff" opacity=".85"><circle cx="32.2" cy="114.4" r="1.5"/><circle cx="66.2" cy="114.4" r="1.5"/><circle cx="100.7" cy="114.4" r="1.5"/></g>
    <g stroke="#c8342b" stroke-width="1.3" opacity=".9" fill="none"><path d="M13 171L13 181M29 171L29 182M45 171L45 181M61 171L61 182M77 171L77 181M93 171L93 182M108 171L108 181"/></g>
    <g stroke="#2b2b2b" stroke-width="1" opacity=".5" fill="none"><path d="M13 181L13 184M29 182L29 185M61 182L61 185M93 182L93 185"/></g>
  </symbol>

  <symbol id="e-moon" viewBox="0 0 120 200">
    <circle cx="60" cy="50" r="46" fill="none" stroke="#f7efd4" stroke-width="1.5" opacity=".1"/>
    <circle cx="60" cy="50" r="40" fill="none" stroke="#f7efd4" stroke-width="2" opacity=".16"/>
    <circle cx="60" cy="50" r="33" fill="url(#moong)"/>
    <circle cx="60" cy="50" r="33" fill="none" stroke="#f7efd4" stroke-width="1.5" opacity=".7"/>
    <g fill="#f7efd4" opacity=".85"><circle cx="16" cy="28" r="1.6"/><circle cx="96" cy="18" r="1.3"/><circle cx="106" cy="44" r="1.5"/><circle cx="10" cy="62" r="1.2"/><circle cx="30" cy="12" r="1.2"/><circle cx="44" cy="6" r="1.1"/></g>
    <path d="M26 64Q44 56 62 62 82 68 98 60" stroke="#ffffff" stroke-width="4" fill="none" opacity=".18" stroke-linecap="round"/>
    <path d="M4 130Q34 110 62 128 90 144 116 124L116 196 4 196Z" fill="#4a4630" opacity=".9"/>
    <g stroke="#c9c39a" stroke-width="1.2" opacity=".5" fill="none"><path d="M20 132C24 128 30 127 36 128M80 140C86 137 92 136 98 137"/></g>
  </symbol>

  <symbol id="e-rain" viewBox="0 0 120 200">
    <g stroke="#8fb4c8" stroke-width="1.4" opacity=".75"><path d="M14 20L8 44M30 14L24 38M46 22L40 46M96 18L90 42M110 26L104 50"/></g>
    <g stroke="#8fb4c8" stroke-width="1" opacity=".4"><path d="M60 6L56 24M74 4L70 22M88 8L84 26M20 6L16 24M6 28L2 46M114 32L110 50"/></g>
    <!-- 伞 -->
    <path d="M30 116Q60 92 90 116Z" fill="#c8342b"/>
    <path d="M30 116Q60 92 90 116" fill="none" stroke="#8e1f2e" stroke-width="1.5"/>
    <path d="M36 108Q60 92 84 108" stroke="#e8b0b0" stroke-width="1.6" fill="none" opacity=".8"/>
    <g stroke="#8e1f2e" stroke-width="1" opacity=".7"><path d="M60 96L60 116M45 100L48 116M75 100L72 116"/></g>
    <path d="M60 116L60 150" stroke="#5a3a1e" stroke-width="2.4"/>
    <!-- 人物 -->
    <path d="M50 150C48 134 52 124 60 124 68 124 72 134 70 150Z" fill="#3f5a8a"/>
    <path d="M54 132C56 128 64 128 66 132" stroke="#2b3a5a" stroke-width="1.4" fill="none" opacity=".8"/>
    <circle cx="60" cy="120" r="6" fill="#e8d4b0"/>
    <path d="M52 150L48 182M68 150L72 182" stroke="#2b3a5a" stroke-width="4"/>
    <path d="M42 182L54 182M66 182L78 182" stroke="#2b2b2b" stroke-width="2.4"/>
    <!-- 蛙与叶 -->
    <ellipse cx="96" cy="176" rx="14" ry="5" fill="#4f8a4a"/>
    <g fill="#6faa3a"><ellipse cx="96" cy="169" rx="6" ry="5"/><circle cx="93" cy="165" r="2"/><circle cx="99" cy="165" r="2"/></g>
    <circle cx="93" cy="165" r=".9" fill="#1a1a1a"/><circle cx="99" cy="165" r=".9" fill="#1a1a1a"/>
    <g fill="none" stroke="#9fc4d8" stroke-width="1.2" opacity=".55"><ellipse cx="16" cy="190" rx="7" ry="2.2"/><ellipse cx="36" cy="192" rx="9" ry="2.6"/><ellipse cx="56" cy="190" rx="7" ry="2.2"/></g>
  </symbol>

  <symbol id="e-phoenix" viewBox="0 0 120 200">
    <g>
      <path d="M56 62C46 52 44 38 54 32 64 26 76 34 74 46 72 56 64 62 56 62Z" fill="#e8c766"/>
      <circle cx="60" cy="36" r="8" fill="#f0d264"/>
      <path d="M66 32L80 28L66 38Z" fill="#c8342b"/>
      <circle cx="62" cy="34" r="1.3" fill="#1a1a1a"/>
      <path d="M56 26C54 18 58 12 64 12 62 18 62 22 60 26Z" fill="#c8342b"/>
      <path d="M56 62C42 66 30 78 28 94 40 92 52 82 58 70Z" fill="#2f8a4c"/>
      <path d="M62 62C76 66 88 78 90 94 78 92 66 82 60 70Z" fill="#2f7a3f"/>
      <path d="M58 68C56 88 54 108 50 128" stroke="#e8c766" stroke-width="7" fill="none" stroke-linecap="round"/>
      <g stroke-width="4.5" fill="none" stroke-linecap="round">
        <path d="M50 126C40 146 30 162 18 176" stroke="#c8342b"/>
        <path d="M52 128C48 150 44 168 38 186" stroke="#e8c766"/>
        <path d="M54 128C58 150 62 168 68 186" stroke="#2f8a4c"/>
        <path d="M56 126C68 144 80 160 94 172" stroke="#6b4a9e"/>
      </g>
      <g fill="#f7e6a8"><circle cx="18" cy="176" r="3.4"/><circle cx="38" cy="186" r="3.4"/><circle cx="68" cy="186" r="3.4"/><circle cx="94" cy="172" r="3.4"/></g>
      <g stroke-width="1.6" opacity=".75" fill="none">
        <path d="M49 138C43 154 35 168 26 178" stroke="#8e1f2e"/>
        <path d="M52 142C49 158 46 172 42 182" stroke="#a8842e"/>
        <path d="M55 144C57 158 60 172 64 182" stroke="#1f5a3a"/>
        <path d="M57 138C64 152 72 164 82 172" stroke="#4a3370"/>
      </g>
      <path d="M58 66C54 84 52 100 51 118" stroke="#f7e6a8" stroke-width="2.4" fill="none" opacity=".9"/>
      <circle cx="60" cy="36" r="5" fill="#f7e6a8" opacity=".55"/>
    </g>
  </symbol>

  <!-- ============ 种 ============ -->
  <symbol id="e-warbler" viewBox="0 0 120 200">
    <g transform="translate(70 118)">
      <ellipse cx="0" cy="0" rx="16" ry="11" fill="#8a9a4a" transform="rotate(-12)"/>
      <circle cx="-13" cy="-9" r="7.5" fill="#9aaa56"/>
      <path d="M-19 -10L-29 -8L-19 -5Z" fill="#3a3226"/>
      <circle cx="-15" cy="-11" r="1.3" fill="#1a1a1a"/>
      <path d="M4 -4C14 -8 22 -2 18 6 10 8 4 4 4 -4Z" fill="#6f7f3a"/>
      <path d="M14 2L28 10L16 8Z" fill="#6f7f3a"/>
      <path d="M-2 10L-4 20M6 9L8 19" stroke="#3a3226" stroke-width="2"/>
    </g>
    <path d="M30 140C50 136 74 138 96 146" stroke="#5a3a1e" stroke-width="3.5" fill="none"/>
  </symbol>

  <symbol id="e-cuckoo" viewBox="0 0 120 200">
    <path d="M92 34A16 16 0 1 0 92 62A13 13 0 1 1 92 34Z" fill="#f0e6b0"/>
    <g transform="translate(52 104) rotate(-8)">
      <ellipse cx="0" cy="0" rx="17" ry="9" fill="#3a3a42"/>
      <circle cx="-15" cy="-6" r="7" fill="#4a4a54"/>
      <path d="M-21 -7L-32 -5L-21 -2Z" fill="#e8c766"/>
      <circle cx="-17" cy="-8" r="1.3" fill="#f7f3ea"/>
      <path d="M-2 -6C6 -26 22 -32 30 -24 24 -12 10 -4 -2 -6Z" fill="#2b2b33"/>
      <path d="M0 4C8 20 22 26 30 20 22 10 10 4 0 4Z" fill="#4a4a54"/>
      <path d="M16 0L36 4L18 8Z" fill="#2b2b33"/>
    </g>
  </symbol>

  <symbol id="e-bridge" viewBox="0 0 120 200">
    <rect x="4" y="120" width="112" height="76" fill="url(#water)"/>
    <g stroke="#f7f3ea" stroke-width="1.2" opacity=".55" fill="none"><path d="M10 140Q30 136 50 140 70 144 90 140M14 158Q34 154 54 158 74 162 96 158M10 176Q30 172 50 176 70 180 90 176"/></g>
    <g fill="#8a6a3e">
      <path d="M8 128L112 112L112 122L8 138Z"/>
      <path d="M8 146L112 130L112 140L8 156Z"/>
    </g>
    <g stroke="#6b4a2e" stroke-width="2.4"><path d="M20 138L20 168M50 132L50 162M80 126L80 156M106 122L106 152"/></g>
    <g fill="#6b4a2e"><rect x="6" y="120" width="6" height="26"/><rect x="108" y="104" width="6" height="26"/></g>
    <g fill="#6b4a9e" opacity=".9"><path d="M18 108C14 100 16 92 22 92 26 96 24 104 20 108Z"/><path d="M96 96C92 88 94 80 100 80 104 84 102 92 98 96Z"/></g>
    <g stroke="#3d7a42" stroke-width="2.4" fill="none"><path d="M20 108L20 124M98 96L98 114M40 112L40 130M70 104L70 122"/></g>
  </symbol>

  <symbol id="e-butterfly" viewBox="0 0 120 200">
    <g transform="translate(70 52) rotate(-12)">
      <path d="M0 0C-16 -20 -34 -18 -32 -2 -30 12 -14 14 0 4Z" fill="#f7f3ea" stroke="#2b2b2b" stroke-width="1.6"/>
      <path d="M0 0C16 -20 34 -18 32 -2 30 12 14 14 0 4Z" fill="#f7f3ea" stroke="#2b2b2b" stroke-width="1.6"/>
      <path d="M0 4C-12 12 -20 24 -10 28 -2 30 0 18 0 8Z" fill="#e8c766" stroke="#2b2b2b" stroke-width="1.4"/>
      <path d="M0 4C12 12 20 24 10 28 2 30 0 18 0 8Z" fill="#e8c766" stroke="#2b2b2b" stroke-width="1.4"/>
      <ellipse cx="0" cy="6" rx="2.6" ry="13" fill="#2b2b2b"/>
      <path d="M-1 -8C-6 -18 -10 -22 -14 -24M1 -8C6 -18 10 -22 14 -24" stroke="#2b2b2b" stroke-width="1.3" fill="none"/>
      <circle cx="-20" cy="-6" r="3.4" fill="#c8342b"/><circle cx="20" cy="-6" r="3.4" fill="#c8342b"/>
    </g>
  </symbol>

  <symbol id="e-boar" viewBox="0 0 120 200">
    <g transform="translate(60 148)">
      <ellipse cx="0" cy="0" rx="30" ry="17" fill="#6b4a3a"/>
      <path d="M-26 -8C-36 -12 -44 -6 -44 2 -44 10 -34 14 -26 10Z" fill="#5a3a2e"/>
      <ellipse cx="-44" cy="4" rx="6" ry="5" fill="#4a2e24"/>
      <circle cx="-46" cy="3" r="1.2" fill="#2b1a14"/><circle cx="-42" cy="5" r="1.2" fill="#2b1a14"/>
      <path d="M-32 -12L-30 -22L-24 -14Z" fill="#4a2e24"/>
      <circle cx="-32" cy="-4" r="1.8" fill="#1a1a1a"/>
      <path d="M-40 8L-46 14" stroke="#f7f3ea" stroke-width="2.2"/>
      <g stroke="#4a2e24" stroke-width="5"><path d="M-16 14L-18 32M-4 16L-4 32M12 14L14 32M24 12L28 30"/></g>
      <path d="M28 -6C36 -10 38 -2 32 2" stroke="#4a2e24" stroke-width="3" fill="none"/>
      <g stroke="#8a6a5a" stroke-width="1.6" opacity=".8"><path d="M-10 -14L-6 -20M0 -16L4 -22M10 -14L14 -20"/></g>
    </g>
  </symbol>

  <symbol id="e-geese" viewBox="0 0 120 200">
    <g fill="#3a3a42">
      <g transform="translate(34 52)"><path d="M0 0C-8 -10 -18 -12 -22 -6 -14 -2 -6 0 0 0Z"/><path d="M0 0C8 -10 18 -12 22 -6 14 -2 6 0 0 0Z"/><ellipse cx="0" cy="2" rx="5" ry="3"/><path d="M-5 2L-12 4L-5 5Z"/></g>
      <g transform="translate(66 78) scale(.9)"><path d="M0 0C-8 -10 -18 -12 -22 -6 -14 -2 -6 0 0 0Z"/><path d="M0 0C8 -10 18 -12 22 -6 14 -2 6 0 0 0Z"/><ellipse cx="0" cy="2" rx="5" ry="3"/><path d="M-5 2L-12 4L-5 5Z"/></g>
      <g transform="translate(44 104) scale(.8)"><path d="M0 0C-8 -10 -18 -12 -22 -6 -14 -2 -6 0 0 0Z"/><path d="M0 0C8 -10 18 -12 22 -6 14 -2 6 0 0 0Z"/><ellipse cx="0" cy="2" rx="5" ry="3"/><path d="M-5 2L-12 4L-5 5Z"/></g>
    </g>
  </symbol>

  <symbol id="e-cup" viewBox="0 0 120 200">
    <path d="M28 138L92 138L84 164Q60 172 36 164Z" fill="#c8342b"/>
    <ellipse cx="60" cy="138" rx="32" ry="8" fill="#e05a4a"/>
    <ellipse cx="60" cy="138" rx="26" ry="5.5" fill="#8e1f2e"/>
    <path d="M36 164Q60 172 84 164L82 170Q60 177 38 170Z" fill="#2b2b2b"/>
    <text x="60" y="158" font-size="16" text-anchor="middle" fill="#f7e6a8" font-family="serif">寿</text>
  </symbol>

  <symbol id="e-deer" viewBox="0 0 120 200">
    <g transform="translate(58 146)">
      <ellipse cx="0" cy="0" rx="26" ry="15" fill="#a8703c"/>
      <path d="M-22 -8C-30 -20 -32 -32 -28 -38" stroke="#a8703c" stroke-width="9" fill="none" stroke-linecap="round"/>
      <ellipse cx="-30" cy="-42" rx="8" ry="6" fill="#b8804a" transform="rotate(-20 -30 -42)"/>
      <path d="M-36 -44L-44 -46L-36 -40Z" fill="#8a5a2e"/>
      <circle cx="-32" cy="-44" r="1.5" fill="#1a1a1a"/>
      <g stroke="#6b4a2e" stroke-width="2.4" fill="none">
        <path d="M-26 -48C-24 -60 -18 -66 -12 -68M-24 -56L-32 -62M-20 -62L-26 -70"/>
        <path d="M-22 -48C-16 -58 -8 -62 -2 -62M-14 -56L-12 -66"/>
      </g>
      <g stroke="#8a5a2e" stroke-width="4.5"><path d="M-14 12L-16 32M-2 14L-2 32M12 12L14 32M22 10L26 28"/></g>
      <path d="M24 -6C32 -10 34 -2 28 2" stroke="#8a5a2e" stroke-width="3" fill="none"/>
      <g fill="#f0e0c8" opacity=".85"><circle cx="-6" cy="-4" r="2"/><circle cx="4" cy="0" r="2"/><circle cx="12" cy="-6" r="2"/><circle cx="-2" cy="6" r="1.8"/><circle cx="8" cy="8" r="1.8"/></g>
    </g>
  </symbol>

  <symbol id="e-swallow" viewBox="0 0 120 200">
    <g transform="translate(56 96) rotate(-10)">
      <path d="M0 0C-10 -14 -26 -18 -34 -10 -22 -4 -10 0 0 0Z" fill="#2b3a4a"/>
      <path d="M0 0C10 -14 26 -18 34 -10 22 -4 10 0 0 0Z" fill="#2b3a4a"/>
      <ellipse cx="0" cy="3" rx="7" ry="5" fill="#33465a"/>
      <path d="M-6 2L-14 4L-6 6Z" fill="#2b2b2b"/>
      <circle cx="-4" cy="1" r="1.2" fill="#f7f3ea"/>
      <path d="M4 6L18 20L10 8Z" fill="#2b3a4a"/><path d="M6 6L24 14L12 8Z" fill="#33465a"/>
      <path d="M-2 6C0 10 4 10 6 6Z" fill="#c8342b"/>
    </g>
  </symbol>

  <!-- ============ 短册 ============
       斜跨右上角的细斜带:自顶部边缘(x≈74)斜向右下延伸至右侧边缘(y≈52),
       带宽 12(牌宽的 10.7%),仅占右上角三角区,不遮挡植物主体;
       配色降饱和贴合整套柔和木版画风。赤短有字、青短蓝调、无字短册更淡。 -->
  <symbol id="r-aka" viewBox="0 0 120 200">
    <path d="M74 4L116 46L116 58L62 4Z" fill="#c07a6e" stroke="#9c5a50" stroke-width=".9"/>
    <path d="M70 4L116 50" fill="none" stroke="#d99e92" stroke-width=".8" opacity=".5"/>
  </symbol>
  <symbol id="r-plain" viewBox="0 0 120 200">
    <path d="M74 4L116 46L116 58L62 4Z" fill="#cf9a8e" stroke="#ab7a6e" stroke-width=".9" opacity=".92"/>
    <path d="M70 4L116 50" fill="none" stroke="#e3b8ac" stroke-width=".8" opacity=".45"/>
  </symbol>
  <symbol id="r-ao" viewBox="0 0 120 200">
    <path d="M74 4L116 46L116 58L62 4Z" fill="#7b87b0" stroke="#5c6890" stroke-width=".9"/>
    <path d="M70 4L116 50" fill="none" stroke="#a3adcc" stroke-width=".8" opacity=".5"/>
  </symbol>
</defs></svg>`;

interface MonthData { m: number; n: string; p: string; bg: string; }
interface CardData { m: number; k: '光' | '种' | '短' | '粕'; e?: string; r?: string; t?: string; dark?: number; dual?: number; }

const MONTHS: MonthData[] = [
  { m: 1, n: '松', p: 'pine', bg: '#f7ecd2' },
  { m: 2, n: '梅', p: 'plum', bg: '#f7e8e4' },
  { m: 3, n: '樱', p: 'cherry', bg: '#f6e9ee' },
  { m: 4, n: '藤', p: 'wisteria', bg: '#eee9f2' },
  { m: 5, n: '菖蒲', p: 'iris', bg: '#e6ecdc' },
  { m: 6, n: '牡丹', p: 'peony', bg: '#f3ead6' },
  { m: 7, n: '萩', p: 'hagi', bg: '#f0ecdc' },
  { m: 8, n: '芒', p: 'susuki', bg: '#e9e6d2' },
  { m: 9, n: '菊', p: 'kiku', bg: '#eef0dc' },
  { m: 10, n: '红叶', p: 'momiji', bg: '#f5e8d4' },
  { m: 11, n: '柳', p: 'yanagi', bg: '#e4ecdc' },
  { m: 12, n: '桐', p: 'kiri', bg: '#eee9f0' },
];

const CARDS: CardData[] = [
  { m: 1, k: '光', e: 'crane' },
  { m: 1, k: '短', r: 'aka', t: 'あかよろし' },
  { m: 1, k: '粕' }, { m: 1, k: '粕' },
  { m: 2, k: '种', e: 'warbler' },
  { m: 2, k: '短', r: 'aka', t: 'あかよろし' },
  { m: 2, k: '粕' }, { m: 2, k: '粕' },
  { m: 3, k: '光', e: 'curtain' },
  { m: 3, k: '短', r: 'aka', t: 'みよしのの' },
  { m: 3, k: '粕' }, { m: 3, k: '粕' },
  { m: 4, k: '种', e: 'cuckoo' },
  { m: 4, k: '短', r: 'plain' },
  { m: 4, k: '粕' }, { m: 4, k: '粕' },
  { m: 5, k: '种', e: 'bridge' },
  { m: 5, k: '短', r: 'plain' },
  { m: 5, k: '粕' }, { m: 5, k: '粕' },
  { m: 6, k: '种', e: 'butterfly' },
  { m: 6, k: '短', r: 'ao' },
  { m: 6, k: '粕' }, { m: 6, k: '粕' },
  { m: 7, k: '种', e: 'boar' },
  { m: 7, k: '短', r: 'plain' },
  { m: 7, k: '粕' }, { m: 7, k: '粕' },
  { m: 8, k: '光', e: 'moon', dark: 1 },
  { m: 8, k: '种', e: 'geese', dark: 1 },
  { m: 8, k: '粕', dark: 1 }, { m: 8, k: '粕', dark: 1 },
  { m: 9, k: '种', e: 'cup', dual: 1 },
  { m: 9, k: '短', r: 'ao' },
  { m: 9, k: '粕' }, { m: 9, k: '粕' },
  { m: 10, k: '种', e: 'deer' },
  { m: 10, k: '短', r: 'ao' },
  { m: 10, k: '粕' }, { m: 10, k: '粕' },
  { m: 11, k: '光', e: 'rain', dark: 2 },
  { m: 11, k: '种', e: 'swallow' },
  { m: 11, k: '短', r: 'plain' },
  { m: 11, k: '粕' },
  { m: 12, k: '光', e: 'phoenix' },
  { m: 12, k: '粕' }, { m: 12, k: '粕' }, { m: 12, k: '粕' },
];

/** 类别 → 数据表 k 值;suit 编码沿用 cards.ts(0♠光 / 1♥种 / 2♣粕 / 3♦短册)。 */
const KIND_OF_SUIT = ['光', '种', '粕', '短'];

function cardSvg(c: CardData, mo: MonthData): string {
  const bg = c.dark===1 ? 'url(#night)' : (c.dark===2 ? '#cdd8d0' : mo.bg);
  let s=`<svg viewBox="0 0 120 200"><rect width="120" height="200" rx="6" fill="#12100c"/><rect x="4" y="4" width="112" height="192" fill="${bg}"/><g clip-path="url(#inner)">`;
  if(c.e!=='moon') s+=`<use href="#p-${mo.p}"/>`;
  else s+=`<use href="#e-moon"/><use href="#p-susuki"/>`;
  if(c.e&&c.e!=='moon') s+=`<use href="#e-${c.e}"/>`;
  if(c.k==='光') s+=`<use href="#g-light"/>`;
  if(c.r){
    s+=`<use href="#r-${c.r}"/>`;
    if(c.t){
      const ch=[...c.t];
      // 沿 45° 斜带中心线排字:起点(72,10)→终点(112,50),每字随带倾斜 45°。
      const fs = ch.length>=5 ? 7 : 8;
      const n = ch.length;
      const x0=73, y0=11, dx=(110-x0)/n, dy=(48-y0)/n;
      s+=`<g fill="#fbf4e6" font-family="serif" font-size="${fs}" text-anchor="middle">`;
      ch.forEach((k,i)=>{
        const px=x0+dx*(i+0.5), py=y0+dy*(i+0.5);
        s+=`<text x="${px.toFixed(1)}" y="${py.toFixed(1)}" transform="rotate(45 ${px.toFixed(1)} ${py.toFixed(1)})">${k}</text>`;
      });
      s+=`</g>`;
    }
  }
  s+=`</g></svg>`;
  return s;
}

/** 渲染一张花札牌面(rank = 月 1~12,suit = 类别编码,id = 同月同类的第几张,默认 0)。
 *  返回完整 <svg> 字符串,由调用方控制显示尺寸;DEFS 需已在文档中。 */
export function hanafudaCardSvg(rank: number, suit: number, id = 0): string {
  const mo = MONTHS[rank - 1];
  if (!mo) throw new Error('bad month ' + rank);
  const kind = KIND_OF_SUIT[suit] as CardData['k'];
  const c = CARDS.filter((d) => d.m === rank && d.k === kind)[id];
  if (!c) throw new Error('no card ' + rank + '/' + kind + '#' + id);
  return cardSvg(c, mo);
}

/** 48 张牌的中文名(月 + 组合),回执与事件文案用;粕/短册无专名,落月名+类名。 */
const HANAFUDA_KIND_KASU = 2;
const HANAFUDA_KIND_TAN = 3;
const NAMES: Record<string, string> = {
  '1-0': '松上鹤', '3-0': '樱上幕', '8-0': '芒上月', '11-0': '柳间雨', '12-0': '桐上凤凰',
  '2-1': '梅上莺', '4-1': '藤上杜鹃', '5-1': '菖蒲八桥', '6-1': '牡丹蝶', '7-1': '萩上猪', '8-1': '芒上雁', '9-1': '菊上杯', '10-1': '红叶鹿', '11-1': '柳上燕',
  '1-3': '松赤短', '2-3': '梅赤短', '3-3': '樱赤短', '4-3': '藤短册', '5-3': '菖蒲短册', '6-3': '牡丹青短', '7-3': '萩短册', '9-3': '菊青短', '10-3': '红叶青短', '11-3': '柳短册',
};
export function hanafudaCardName(rank: number, suit: number): string {
  return NAMES[rank + '-' + suit] ?? (MONTHS[rank - 1]?.n ?? '') + (suit === HANAFUDA_KIND_KASU ? '粕' : suit === HANAFUDA_KIND_TAN ? '短册' : '');
}

/** 牌的悬停标签:名字 + 类别 + 月份(菊上杯标注兼粕);给不熟花札的玩家一目了然。 */
export function hanafudaCardLabel(rank: number, suit: number): string {
  const kind = ['光', '种', '粕', '短册'][suit] ?? '';
  const dual = rank === 9 && suit === 1 ? '(兼粕)' : '';
  const month = MONTHS[rank - 1]?.n ?? '';
  return `${hanafudaCardName(rank, suit)} · ${kind}${dual}(${month}月)`;
}

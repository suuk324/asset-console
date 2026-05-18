import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const clampEase = {
  extrapolateLeft: 'clamp' as const,
  extrapolateRight: 'clamp' as const,
};

const cursorWidth = 126;
const cursorHeight = 174;

const Cursor = ({pressed}: {pressed: number}) => {
  return (
    <svg
      viewBox="0 0 126 174"
      width={cursorWidth}
      height={cursorHeight}
      style={{
        filter: `drop-shadow(0 14px 20px rgba(0, 0, 0, 0.42))`,
        transform: `scale(${1 - pressed * 0.08})`,
        transformOrigin: '20% 15%',
      }}
    >
      <path
        d="M14 8 L14 138 L48 112 L67 162 L92 151 L73 102 L119 102 Z"
        fill="#ffffff"
        stroke="#0a0a0a"
        strokeWidth="8"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export const FluxMintIntro = () => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();

  const fadeIn = interpolate(frame, [0, 0.35 * fps], [0, 1], {
    ...clampEase,
    easing: Easing.bezier(0.22, 1, 0.36, 1),
  });

  const iconEnter = interpolate(frame, [0, 0.55 * fps], [0.82, 1], {
    ...clampEase,
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  const clickStart = 1.0 * fps;
  const clickPress = interpolate(
    frame,
    [clickStart, clickStart + 0.1 * fps, clickStart + 0.24 * fps],
    [0, 1, 0],
    {
      ...clampEase,
      easing: Easing.bezier(0.34, 1.56, 0.64, 1),
    },
  );

  const clickSpring = spring({
    fps,
    frame: frame - clickStart,
    config: {
      damping: 11,
      stiffness: 170,
      mass: 0.9,
    },
  });

  const cursorTravelStart = 0.35 * fps;
  const cursorTravelEnd = 0.92 * fps;
  const cursorX = interpolate(
    frame,
    [cursorTravelStart, cursorTravelEnd],
    [width / 2 + 290, width / 2 + 88],
    {
      ...clampEase,
      easing: Easing.bezier(0.2, 0.8, 0.2, 1),
    },
  );
  const cursorY = interpolate(
    frame,
    [cursorTravelStart, cursorTravelEnd],
    [height / 2 + 320, height / 2 + 96],
    {
      ...clampEase,
      easing: Easing.bezier(0.2, 0.8, 0.2, 1),
    },
  );

  const cursorOpacity = interpolate(frame, [0.24 * fps, 0.5 * fps], [0, 1], clampEase);

  const iconScale = iconEnter * (1 - clickPress * 0.075 + clickSpring * 0.02);
  const iconGlow = 0.18 + clickSpring * 0.22;
  const rippleScale = interpolate(frame, [clickStart, clickStart + 0.42 * fps], [1, 1.58], clampEase);
  const rippleOpacity = interpolate(
    frame,
    [clickStart, clickStart + 0.12 * fps, clickStart + 0.42 * fps],
    [0, 0.45, 0],
    clampEase,
  );
  const cursorRingScale = interpolate(
    frame,
    [clickStart, clickStart + 0.34 * fps],
    [0.5, 1.35],
    clampEase,
  );
  const cursorRingOpacity = interpolate(
    frame,
    [clickStart, clickStart + 0.08 * fps, clickStart + 0.34 * fps],
    [0, 0.58, 0],
    clampEase,
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#000000',
        overflow: 'hidden',
        opacity: fadeIn,
      }}
    >
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(circle at center, rgba(27, 62, 120, 0.22) 0%, rgba(10, 14, 24, 0.18) 30%, rgba(0, 0, 0, 0) 58%)',
        }}
      />

      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: 240,
            height: 240,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: `scale(${iconScale})`,
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: -34,
              borderRadius: 999,
              background: `radial-gradient(circle, rgba(64, 133, 255, ${iconGlow}) 0%, rgba(64, 133, 255, 0) 68%)`,
              filter: 'blur(22px)',
            }}
          />

          <div
            style={{
              position: 'absolute',
              inset: -22,
              borderRadius: 999,
              border: `2px solid rgba(108, 170, 255, ${rippleOpacity})`,
              transform: `scale(${rippleScale})`,
            }}
          />

          <div
            style={{
              width: 184,
              height: 184,
              borderRadius: 40,
              background:
                'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)',
              boxShadow:
                '0 0 0 1px rgba(255,255,255,0.07) inset, 0 24px 60px rgba(0,0,0,0.45)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backdropFilter: 'blur(10px)',
            }}
          >
            <Img
              src={staticFile('icon.ico')}
              style={{
                width: 144,
                height: 144,
                objectFit: 'contain',
              }}
            />
          </div>
        </div>
      </AbsoluteFill>

      <div
        style={{
          position: 'absolute',
          left: cursorX - cursorWidth / 2,
          top: cursorY - cursorHeight / 2,
          opacity: cursorOpacity,
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 30,
            top: 24,
            width: 30,
            height: 30,
            borderRadius: '50%',
            border: `2px solid rgba(255,255,255,${cursorRingOpacity})`,
            transform: `scale(${cursorRingScale})`,
          }}
        />
        <Cursor pressed={clickPress} />
      </div>
    </AbsoluteFill>
  );
};

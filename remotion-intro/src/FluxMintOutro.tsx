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

const clamp = {
  extrapolateLeft: 'clamp' as const,
  extrapolateRight: 'clamp' as const,
};

export const FluxMintOutro = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const fadeIn = interpolate(frame, [0, 0.4 * fps], [0, 1], {
    ...clamp,
    easing: Easing.bezier(0.22, 1, 0.36, 1),
  });

  const fadeOut = interpolate(frame, [2.35 * fps, 3 * fps], [1, 0], {
    ...clamp,
    easing: Easing.bezier(0.4, 0, 0.2, 1),
  });

  const overallOpacity = fadeIn * fadeOut;

  const iconSpring = spring({
    fps,
    frame,
    config: {
      damping: 12,
      stiffness: 150,
      mass: 0.9,
    },
  });

  const iconScale = interpolate(iconSpring, [0, 1], [0.78, 1], clamp);
  const iconLift = interpolate(iconSpring, [0, 1], [26, 0], clamp);

  const titleOpacity = interpolate(frame, [0.3 * fps, 0.95 * fps], [0, 1], {
    ...clamp,
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const titleY = interpolate(frame, [0.3 * fps, 0.95 * fps], [28, 0], clamp);

  const subtitleOpacity = interpolate(frame, [0.75 * fps, 1.45 * fps], [0, 1], {
    ...clamp,
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const subtitleY = interpolate(frame, [0.75 * fps, 1.45 * fps], [24, 0], clamp);

  const chipOpacity = interpolate(frame, [1.15 * fps, 1.9 * fps], [0, 1], {
    ...clamp,
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#000000',
        overflow: 'hidden',
        opacity: overallOpacity,
        color: '#ffffff',
        fontFamily:
          '"Segoe UI", "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif',
      }}
    >
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(circle at center, rgba(24, 56, 116, 0.28) 0%, rgba(8, 12, 20, 0.16) 34%, rgba(0,0,0,0) 62%)',
        }}
      />

      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 84px',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 24,
          }}
        >
          <div
            style={{
              position: 'relative',
              width: 188,
              height: 188,
              transform: `translateY(${iconLift}px) scale(${iconScale})`,
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: -32,
                borderRadius: 999,
                background:
                  'radial-gradient(circle, rgba(58, 131, 255, 0.24) 0%, rgba(58, 131, 255, 0) 72%)',
                filter: 'blur(24px)',
              }}
            />
            <div
              style={{
                width: 188,
                height: 188,
                borderRadius: 42,
                background:
                  'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)',
                boxShadow:
                  '0 0 0 1px rgba(255,255,255,0.08) inset, 0 24px 60px rgba(0,0,0,0.42)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backdropFilter: 'blur(12px)',
              }}
            >
              <Img
                src={staticFile('icon.ico')}
                style={{
                  width: 148,
                  height: 148,
                  objectFit: 'contain',
                }}
              />
            </div>
          </div>

          <div
            style={{
              textAlign: 'center',
              transform: `translateY(${titleY}px)`,
              opacity: titleOpacity,
            }}
          >
            <div
              style={{
                fontSize: 70,
                fontWeight: 700,
                letterSpacing: 1,
                lineHeight: 1.1,
              }}
            >
              FluxMint
            </div>
            <div
              style={{
                marginTop: 10,
                fontSize: 30,
                fontWeight: 500,
                letterSpacing: 6,
                color: 'rgba(255,255,255,0.72)',
              }}
            >
              设计资产台
            </div>
          </div>

          <div
            style={{
              width: 156,
              height: 4,
              borderRadius: 999,
              background: 'linear-gradient(90deg, #2dc6e8 0%, #ffc13d 100%)',
              opacity: subtitleOpacity,
              transform: `translateY(${subtitleY}px)`,
              boxShadow: '0 0 24px rgba(92, 154, 255, 0.28)',
            }}
          />

          <div
            style={{
              maxWidth: 760,
              textAlign: 'center',
              fontSize: 34,
              lineHeight: 1.55,
              color: 'rgba(255,255,255,0.88)',
              opacity: subtitleOpacity,
              transform: `translateY(${subtitleY}px)`,
            }}
          >
            把真实项目文件夹
            <br />
            变成一个更高效的工作台
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              marginTop: 14,
              opacity: chipOpacity,
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            {['统一预览', '整理归档', '快速调用'].map((item) => (
              <div
                key={item}
                style={{
                  padding: '12px 22px',
                  borderRadius: 999,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'rgba(255,255,255,0.04)',
                  fontSize: 22,
                  color: 'rgba(255,255,255,0.72)',
                }}
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

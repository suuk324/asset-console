import {Composition} from 'remotion';
import {FluxMintIntro} from './FluxMintIntro';
import {FluxMintOutro} from './FluxMintOutro';

export const Root = () => {
  return (
    <>
      <Composition
        id="FluxMintIntro"
        component={FluxMintIntro}
        durationInFrames={60}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="FluxMintOutro"
        component={FluxMintOutro}
        durationInFrames={90}
        fps={30}
        width={1080}
        height={1920}
      />
    </>
  );
};

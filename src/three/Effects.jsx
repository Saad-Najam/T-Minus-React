import { AdaptiveDpr } from '@react-three/drei';
import { Bloom, EffectComposer, SMAA, Vignette } from '@react-three/postprocessing';
import { useQuality } from '../state/quality.js';

/** Cinematic post-processing: bloom on engine plumes, lit parts and the atmosphere limb, plus a soft vignette. Off on Low. */
export default function Effects({ bloom = 0.55, threshold = 0.82, vignette = 0.55 }) {
  const q = useQuality();
  return (
    <>
      <AdaptiveDpr pixelated={false} />
      {q.bloom && (
        <EffectComposer multisampling={q.msaa} disableNormalPass>
          <Bloom intensity={bloom} luminanceThreshold={threshold} luminanceSmoothing={0.25} mipmapBlur radius={0.7} />
          <Vignette eskil={false} offset={0.22} darkness={vignette} />
          {q.smaa ? <SMAA /> : <></>}
        </EffectComposer>
      )}
    </>
  );
}

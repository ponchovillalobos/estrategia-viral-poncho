import { Composition } from "remotion";
import { ViralVideo, viralVideoSchema, defaultProps } from "./ViralVideo";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="ViralVideo"
        component={ViralVideo}
        durationInFrames={900}
        fps={30}
        width={1080}
        height={1920}
        schema={viralVideoSchema}
        defaultProps={defaultProps}
        calculateMetadata={({ props }) => {
          const totalSeconds = props.videoDurationSec ?? 30;
          return {
            durationInFrames: Math.ceil(totalSeconds * 30),
            // Dimensiones dinámicas desde props — defaults 1080×1920 (vertical 9:16).
            // El wizard puede pasar { width: 1920, height: 1080 } para horizontal 16:9.
            width: props.width ?? 1080,
            height: props.height ?? 1920,
          };
        }}
      />
    </>
  );
};

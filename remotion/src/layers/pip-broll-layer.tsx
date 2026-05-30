import { AbsoluteFill, OffthreadVideo, useVideoConfig } from "remotion";

/**
 * B-roll en modo "PIP" (Picture-in-Picture): el clip de Pexels se muestra en un cuadrito
 * con borde de color de marca, sobre el video base. Layout responsivo según comp size.
 */
export const PipBRollLayer: React.FC<{
  url: string;
  accent: string;
}> = ({ url, accent }) => {
  const { width: compWidth, height: compHeight } = useVideoConfig();
  const pipWidth = Math.min(compWidth * 0.5, 540);
  const pipHeight = Math.min(compHeight * 0.375, 720);
  const paddingBottom = compHeight * 0.25;
  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom,
      }}
    >
      <div
        style={{
          width: pipWidth,
          height: pipHeight,
          borderRadius: 28,
          overflow: "hidden",
          border: `5px solid ${accent}`,
          boxShadow: `0 0 60px ${accent}55, 0 12px 40px rgba(0,0,0,0.7)`,
          background: "#000",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <OffthreadVideo
          src={url}
          muted
          style={{
            maxWidth: "100%",
            maxHeight: "100%",
            width: "auto",
            height: "auto",
            objectFit: "contain",
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

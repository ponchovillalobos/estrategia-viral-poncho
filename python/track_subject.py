"""Motion tracking del sujeto (cara) para pegar texto/stickers que lo siguen.

Uso:
    python track_subject.py <ruta_video> [sample_every_seg]

Salida (stdout, una línea JSON):
    {"fps": 30.0, "points": [{"t":0.0,"x":0.5,"y":0.33,"w":0.2,"h":0.28}, ...]}

x,y = centro de la cara normalizado (0..1). Lo usa Remotion (TrackedLayer) para
posicionar un label que sigue al sujeto. Muestrea cada `sample_every` segundos
(default 0.12s). Usa el detector Haar de OpenCV (incluido, sin descargas). Si algo
falla, devuelve {"points": []} → el caller sigue sin tracking.
"""
import sys
import json

try:
    import config  # noqa: F401
except Exception:
    pass


def main() -> None:
    if len(sys.argv) < 2:
        print(json.dumps({"points": [], "error": "no input"}))
        return
    video_path = sys.argv[1]
    sample_every = float(sys.argv[2]) if len(sys.argv) > 2 else 0.12
    try:
        import cv2

        cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        face_cascade = cv2.CascadeClassifier(cascade_path)
        if face_cascade.empty():
            print(json.dumps({"points": [], "error": "cascade not loaded"}))
            return

        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            print(json.dumps({"points": [], "error": "cannot open video"}))
            return
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        step = max(1, int(round(sample_every * fps)))

        points = []
        idx = 0
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            if idx % step == 0:
                h, w = frame.shape[:2]
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                faces = face_cascade.detectMultiScale(
                    gray, scaleFactor=1.1, minNeighbors=5, minSize=(int(w * 0.06), int(w * 0.06))
                )
                if len(faces) > 0:
                    fx, fy, fw, fh = max(faces, key=lambda f: int(f[2]) * int(f[3]))
                    cx = (fx + fw / 2.0) / w
                    cy = (fy + fh / 2.0) / h
                    points.append({
                        "t": round(idx / fps, 3),
                        "x": round(float(min(max(cx, 0), 1)), 4),
                        "y": round(float(min(max(cy, 0), 1)), 4),
                        "w": round(float(fw / w), 4),
                        "h": round(float(fh / h), 4),
                    })
            idx += 1
        cap.release()
        print(json.dumps({"fps": round(float(fps), 3), "points": points}))
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"points": [], "error": str(e)}))


if __name__ == "__main__":
    main()

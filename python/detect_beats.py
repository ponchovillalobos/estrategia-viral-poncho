"""Detecta beats de un track de música para "cortar al ritmo".

Uso:
    python detect_beats.py <ruta_audio>

Salida (stdout, una línea JSON):
    {"tempo": 120.0, "beats": [{"t": 0.51, "strength": 1.83}, ...]}

Usa librosa (beat tracking + onset strength para rankear los beats por intensidad).
Si librosa o el archivo fallan, devuelve {"beats": []} → el caller sigue sin beat-sync.
"""
import sys
import json

# Importar config primero: inyecta el ffmpeg portable en PATH (librosa/audioread lo
# necesitan para decodificar mp3).
try:
    import config  # noqa: F401
except Exception:
    pass


def main() -> None:
    if len(sys.argv) < 2:
        print(json.dumps({"beats": [], "tempo": 0, "error": "no input"}))
        return
    audio_path = sys.argv[1]
    try:
        import numpy as np
        import librosa

        y, sr = librosa.load(audio_path, sr=22050, mono=True)
        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        beat_times = librosa.frames_to_time(beat_frames, sr=sr)

        # Onset strength por frame → intensidad de cada beat (para quedarnos con los
        # más fuertes, que son los que mejor "pegan" visualmente).
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        beats = []
        for bt in beat_times:
            fr = int(librosa.time_to_frames(bt, sr=sr))
            fr = max(0, min(fr, len(onset_env) - 1))
            beats.append({"t": round(float(bt), 3), "strength": round(float(onset_env[fr]), 4)})

        tempo_val = float(np.atleast_1d(tempo)[0])
        print(json.dumps({"tempo": round(tempo_val, 2), "beats": beats}))
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"beats": [], "tempo": 0, "error": str(e)}))


if __name__ == "__main__":
    main()

import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setConcurrency(4);
Config.setCodec("h264");
Config.setPixelFormat("yuv420p");
// CRF 24 = compresión balanceada (calidad alta, ~30% más liviano que CRF 20).
// NO setear videoBitrate junto con CRF (son mutuamente excluyentes en Remotion).
Config.setCrf(24);

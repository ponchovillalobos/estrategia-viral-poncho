/**
 * B5 — Iconos curados (lucide-react, offline, MIT). El motor de render usa este mapa
 * para que cualquier icon-sticker pueda pedir un icono por NOMBRE (string), sin que
 * cada caller tenga que conocer la API de lucide.
 *
 * Si el nombre no está en el mapa, el caller debe caerse a `Sparkles` (default visual).
 */
import {
  Flame, Rocket, Target, Lightbulb, Heart, Star, Zap, TrendingUp, ThumbsUp, Eye,
  Crown, Sparkles, Brain, MessageCircle, DollarSign, Award, Bell, CheckCircle,
  AlertTriangle, Music, Camera, Film, Hash, Bookmark, Share2, Play, Coffee, Smile,
  Gem, Sun,
} from "lucide-react";

export type IconComponent = React.ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

export const ICON_MAP: Record<string, IconComponent> = {
  fire: Flame, rocket: Rocket, target: Target, lightbulb: Lightbulb, heart: Heart,
  star: Star, zap: Zap, trending: TrendingUp, thumbsup: ThumbsUp, eye: Eye,
  crown: Crown, sparkles: Sparkles, brain: Brain, message: MessageCircle,
  money: DollarSign, award: Award, bell: Bell, check: CheckCircle, warn: AlertTriangle,
  music: Music, camera: Camera, film: Film, hash: Hash, bookmark: Bookmark,
  share: Share2, play: Play, coffee: Coffee, smile: Smile, gem: Gem, sun: Sun,
};

/** Fallback canónico cuando un nombre de icono no aparece en el mapa. */
export const FallbackIcon = Sparkles;

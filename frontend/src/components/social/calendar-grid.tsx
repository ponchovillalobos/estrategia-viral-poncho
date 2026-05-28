import { CALENDAR } from "@/data/calendar";
import { DayCard } from "@/components/social/day-card";
import type { PlatformKey } from "@/lib/platforms";

interface CalendarGridProps {
  platform: PlatformKey;
}

export function CalendarGrid({ platform }: CalendarGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {CALENDAR.map((day) => (
        <DayCard key={day.day} day={day} platform={platform} />
      ))}
    </div>
  );
}

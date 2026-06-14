"use client"

import * as React from "react"
import { Slider as SliderPrimitive } from "@base-ui/react/slider"

import { cn } from "@/lib/utils"

/**
 * Slider de un solo valor. API simplificada estilo shadcn:
 *   <Slider value={35} min={0} max={100} step={1} onValueChange={(v) => ...} />
 *
 * El proyecto usa @base-ui/react (no radix). Esta envoltura expone un único
 * número (no un array) y un onValueChange limpio `(value: number) => void`
 * para que los callers y los tests no tengan que lidiar con eventDetails.
 */
interface SliderProps {
  value: number
  defaultValue?: number
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  className?: string
  "aria-label"?: string
  onValueChange?: (value: number) => void
}

function Slider({
  value,
  defaultValue,
  min = 0,
  max = 100,
  step = 1,
  disabled,
  className,
  onValueChange,
  ...props
}: SliderProps) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      value={value}
      defaultValue={defaultValue}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onValueChange={(v) => {
        const next = Array.isArray(v) ? v[0] : v
        onValueChange?.(next as number)
      }}
      className={cn("relative flex w-full touch-none items-center select-none", className)}
      {...props}
    >
      <SliderPrimitive.Control
        data-slot="slider-control"
        className="flex w-full items-center py-2"
      >
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-indicator"
            className="absolute h-full rounded-full bg-foreground"
          />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          className="block size-4 shrink-0 rounded-full border border-foreground/40 bg-background shadow-sm transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
        />
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }

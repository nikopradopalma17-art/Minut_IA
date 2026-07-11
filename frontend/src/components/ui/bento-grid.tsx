import * as React from "react"
import { cn } from "@/lib/utils"

const colSpanClasses = {
  1: "md:col-span-1",
  2: "md:col-span-2",
  3: "md:col-span-3",
}

const rowSpanClasses = {
  1: "md:row-span-1",
  2: "md:row-span-2",
  3: "md:row-span-3",
}

const BentoGrid = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "grid grid-cols-1 md:grid-cols-3 gap-6 max-w-7xl mx-auto",
        className
      )}
      {...props}
    />
  )
})
BentoGrid.displayName = "BentoGrid"

interface BentoCardProps extends React.HTMLAttributes<HTMLDivElement> {
  rowSpan?: 1 | 2 | 3
  colSpan?: 1 | 2 | 3
}

const BentoCard = React.forwardRef<HTMLDivElement, BentoCardProps>(
  ({ className, rowSpan = 1, colSpan = 1, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-2xl border bg-card text-card-foreground shadow-sm flex flex-col p-6 transition-all duration-200 hover:shadow-md hover:border-impulso-ocean/40",
          colSpanClasses[colSpan] || "md:col-span-1",
          rowSpanClasses[rowSpan] || "md:row-span-1",
          className
        )}
        {...props}
      />
    )
  }
)
BentoCard.displayName = "BentoCard"

export { BentoGrid, BentoCard }

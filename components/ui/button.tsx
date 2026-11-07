import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// shadcn/ui Radix Button pattern, adapted to Ayaale's T002 design contract.
const buttonVariants = cva(
  "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-sm px-4 py-2 text-base font-semibold whitespace-normal transition-colors disabled:pointer-events-none disabled:bg-disabled-background disabled:text-disabled-foreground aria-invalid:border-destructive focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:ring-2 focus-visible:ring-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover",
        secondary: "bg-secondary text-secondary-foreground hover:bg-muted",
        outline: "border border-input bg-card text-card-foreground hover:bg-secondary",
        ghost: "text-foreground hover:bg-secondary",
        destructive: "bg-destructive text-destructive-foreground hover:underline",
        link: "text-primary underline underline-offset-4 hover:decoration-2",
      },
      size: {
        default: "px-4 py-2",
        sm: "px-3 py-2 text-sm",
        lg: "px-6 py-3",
        icon: "size-11 p-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  type,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...(!asChild ? { type: type ?? "button" } : {})}
      {...props}
    />
  );
}

export { Button, buttonVariants };


import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal
const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef(
  ({ className, ...props }, ref) => (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        "fixed inset-0 z-50 bg-[#242039]/35 backdrop-blur-[4px]",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
        className
      )}
      {...props}
    />
  )
)
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const dialogSizes = {
  sm: "max-w-md",
  default: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-3xl",
  full: "max-w-5xl",
}

const DialogContent = React.forwardRef(
  (
    {
      className,
      children,
      size = "lg",
      showCloseButton = true,
      ...props
    },
    ref
  ) => (
    <DialogPortal>
      <DialogOverlay />

      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed left-1/2 top-1/2 z-50",
          "grid w-[calc(100%-24px)]",
          dialogSizes[size] || dialogSizes.lg,
          "max-h-[88dvh] -translate-x-1/2 -translate-y-1/2",
          "overflow-hidden rounded-[22px]",
          "border border-[#e9e6f1]",
          "bg-white text-[#20213a]",
          "shadow-[0_24px_80px_-20px_rgba(42,32,82,0.30)]",
          "outline-none",
          "data-[state=open]:animate-in",
          "data-[state=closed]:animate-out",
          "data-[state=open]:fade-in-0",
          "data-[state=closed]:fade-out-0",
          "data-[state=open]:zoom-in-95",
          "data-[state=closed]:zoom-out-95",
          "duration-200 ease-out",
          className
        )}
        {...props}
      >
        {children}

        {showCloseButton && (
          <DialogPrimitive.Close
            className={cn(
              "absolute right-5 top-5 z-20",
              "flex h-9 w-9 items-center justify-center",
              "rounded-xl text-slate-400",
              "transition-all duration-200",
              "hover:bg-[#f5f3fa] hover:text-[#24213d]",
              "focus-visible:outline-none",
              "focus-visible:ring-2 focus-visible:ring-emerald-600",
              "focus-visible:ring-offset-2"
            )}
          >
            <X className="h-[19px] w-[19px]" strokeWidth={1.8} />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
)
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  icon: Icon,
  ...props
}) => (
  <div
    className={cn(
      "flex min-h-[72px] items-center gap-3",
      "border-b border-[#efedf4]",
      "px-6 py-4 pr-16 text-left",
      className
    )}
    {...props}
  >
    {Icon && (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#eaf8f1] text-emerald-700">
        <Icon className="h-5 w-5" strokeWidth={2} />
      </div>
    )}

    <div className="min-w-0 flex-1 flex flex-col gap-1">
      {props.children}
    </div>
  </div>
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({ className, ...props }) => (
  <div
    className={cn(
      "flex flex-col-reverse gap-2",
      "border-t border-[#efedf4]",
      "bg-[#fdfcff]",
      "px-6 py-4",
      "sm:flex-row sm:items-center sm:justify-end",
      "[&>button]:min-h-10",
      "[&>button]:rounded-xl",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogBody = ({ className, ...props }) => (
  <div
    className={cn(
      "overflow-y-auto px-6 py-5",
      "scrollbar-thin scrollbar-thumb-[#ddd8eb]",
      className
    )}
    {...props}
  />
)
DialogBody.displayName = "DialogBody"

const DialogTitle = React.forwardRef(
  ({ className, ...props }, ref) => (
    <DialogPrimitive.Title
      ref={ref}
      className={cn(
        "text-[17px] font-semibold",
        "leading-6 tracking-[-0.025em]",
        "text-[#20213a]",
        className
      )}
      {...props}
    />
  )
)
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef(
  ({ className, ...props }, ref) => (
    <DialogPrimitive.Description
      ref={ref}
      className={cn(
        "text-[13px] leading-relaxed",
        "text-[#858397]",
        className
      )}
      {...props}
    />
  )
)
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}

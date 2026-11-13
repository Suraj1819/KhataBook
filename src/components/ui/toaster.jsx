
import { Toaster } from "sonner"

export function AppToaster() {
  return (
    <Toaster
      position="top-right"
      theme="light"
      richColors={false}
      closeButton
      expand={false}
      duration={3500}
      visibleToasts={3}
      gap={8}
      offset={16}
      toastOptions={{
        classNames: {
          toast: `
            !relative
            !rounded-xl
            !border
            !border-violet-200
            !bg-white
            !px-4
            !py-3
            !pr-10
            !shadow-sm
            !text-slate-700
          `,

          title: `
            !text-[13px]
            !font-semibold
            !text-slate-800
          `,

          description: `
            !mt-0.5
            !text-xs
            !leading-5
            !text-slate-500
          `,

          success: `
            !border-emerald-200
            [&_[data-icon]]:!text-emerald-600
          `,

          error: `
            !border-rose-200
            [&_[data-icon]]:!text-rose-600
          `,

          warning: `
            !border-amber-200
            [&_[data-icon]]:!text-amber-600
          `,

          info: `
            !border-blue-200
            [&_[data-icon]]:!text-blue-600
          `,

          closeButton: `
            !absolute
            !left-auto
            !right-2
            !top-1/2
            !-translate-y-1/2
            !translate-x-0
            !h-7
            !w-7
            !rounded-lg
            !border-0
            !bg-transparent
            !text-slate-400
            hover:!bg-violet-50
            hover:!text-slate-700
          `,

          actionButton: `
            !rounded-lg
            !bg-emerald-700
            !px-3
            !text-xs
            !font-semibold
            !text-white
            hover:!bg-emerald-800
          `,

          cancelButton: `
            !rounded-lg
            !border
            !border-violet-200
            !bg-white
            !text-xs
            !font-medium
            !text-slate-700
            hover:!bg-violet-50
          `,
        },
      }}
    />
  )
}

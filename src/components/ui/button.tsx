import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/35 disabled:pointer-events-none disabled:opacity-50 active:translate-y-px border border-transparent [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary-hover',
        outline: 'bg-card border-border text-foreground hover:bg-background',
        secondary: 'bg-secondary border-border text-secondary-foreground hover:bg-background',
        ghost: 'text-foreground hover:bg-accent hover:text-primary',
        destructive: 'bg-destructive/10 text-destructive hover:bg-destructive/15',
        link: 'text-primary underline-offset-4 hover:underline',
        success: 'bg-success-solid text-white hover:bg-success',
      },
      size: {
        default: 'h-9 px-4',
        sm: 'h-8 rounded-md px-2.5 text-xs',
        lg: 'h-10 px-4',
        icon: 'size-9',
        field: 'h-14 rounded-xl px-5 text-base font-semibold [&_svg]:size-5',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, disabled, children, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...props}>
      {loading && <Loader2 className="animate-spin" />}
      {children}
    </button>
  ),
)
Button.displayName = 'Button'

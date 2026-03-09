interface BrandAvatarProps {
  name: string
  logoUrl?: string | null
  size?: "sm" | "md" | "lg"
}

const sizeClasses = {
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-xs",
  lg: "h-10 w-10 text-sm",
}

export function BrandAvatar({ name, logoUrl, size = "md" }: BrandAvatarProps) {
  const classes = sizeClasses[size]

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={name}
        className={`${classes} rounded-lg object-cover flex-shrink-0`}
      />
    )
  }

  return (
    <div
      className={`${classes} flex items-center justify-center rounded-lg bg-muted font-bold uppercase flex-shrink-0`}
    >
      {name[0]}
    </div>
  )
}

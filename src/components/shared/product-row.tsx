import { formatPrice } from "@/lib/utils"

interface ProductRowProps {
  title: string
  subtitle: string
  imageUrl: string | null
  price?: number | string | null
  compareAtPrice?: number | string | null
  currency?: string | null
  /** Contenido extra a la derecha (badges, etc.) */
  extra?: React.ReactNode
}

export function ProductRow({
  title,
  subtitle,
  imageUrl,
  price,
  compareAtPrice,
  currency,
  extra,
}: ProductRowProps) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={title}
          className="h-9 w-9 rounded-md object-cover flex-shrink-0"
        />
      ) : (
        <div className="h-9 w-9 rounded-md bg-muted flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{title}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {extra}
      {price != null && (
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-semibold">{formatPrice(price, currency ?? undefined)}</p>
          {compareAtPrice != null && (
            <p className="text-xs text-muted-foreground line-through">
              {formatPrice(compareAtPrice, currency ?? undefined)}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

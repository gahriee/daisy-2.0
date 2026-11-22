import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

const variants = {
  primary:
    "border-transparent bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-hover",
  secondary:
    "border-control-border bg-surface text-foreground hover:bg-surface-muted/70 active:bg-surface-muted",
  ghost:
    "border-transparent bg-transparent text-primary hover:bg-surface-muted hover:text-primary-hover active:bg-surface-muted",
  danger:
    "border-transparent bg-danger text-primary-foreground hover:bg-danger-hover active:bg-danger-hover",
};

const sizes = {
  md: "min-h-11 min-w-11 px-4 py-2 text-sm",
  sm: "min-h-9 min-w-9 px-3 py-1.5 text-[13px]",
};

type ButtonClassOptions = {
  variant?: keyof typeof variants | undefined;
  size?: keyof typeof sizes | undefined;
  className?: string | undefined;
};

/**
 * Shared Tailwind utility recipe for buttons and button-styled navigation links.
 */
export function buttonClasses({
  variant = "primary",
  size = "md",
  className,
}: ButtonClassOptions = {}) {
  return cn(
    "inline-flex cursor-pointer items-center justify-center gap-2 rounded-control border font-medium leading-none tracking-[-0.005em] whitespace-nowrap transition-[background-color,color,border-color] duration-(--duration-control) ease-(--ease-control) disabled:cursor-not-allowed disabled:opacity-50",
    sizes[size],
    variants[variant],
    className,
  );
}

type ButtonProps = ComponentProps<"button"> &
  ButtonClassOptions & {
    loading?: boolean;
  };

/**
 * Primary, tonal-secondary, ghost, and danger action button with 500 operational
 * typography and flat color transitions without scale or translation transforms.
 */
export function Button({
  className,
  variant = "primary",
  size = "md",
  type = "button",
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, className })}
    >
      {loading && (
        <svg
          aria-hidden="true"
          className="size-4 shrink-0 motion-safe:animate-spin"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            cx="12"
            cy="12"
            r="9"
            stroke="currentColor"
            strokeWidth="2"
            opacity="0.25"
          />
          <path
            d="M12 3a9 9 0 0 1 9 9"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      )}
      {children}
    </button>
  );
}

const linkTones = {
  primary: "text-primary hover:text-primary-hover",
  foreground: "text-foreground hover:text-primary",
  muted: "text-muted-foreground hover:text-foreground",
};

const linkSizes = {
  sm: "min-h-11 sm:min-h-8 text-[13px]",
  md: "min-h-11 text-sm",
};

type LinkClassOptions = {
  tone?: keyof typeof linkTones | undefined;
  size?: keyof typeof linkSizes | undefined;
  className?: string | undefined;
};

/**
 * Unboxed link UI recipe for table/chart container headers and inline navigation.
 */
export function linkClasses({
  tone = "primary",
  size = "sm",
  className,
}: LinkClassOptions = {}) {
  return cn(
    "group/link inline-flex cursor-pointer items-center gap-1.5 rounded-control font-medium leading-none tracking-[-0.005em] whitespace-nowrap transition-colors duration-(--duration-control) ease-(--ease-control) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50",
    linkSizes[size],
    linkTones[tone],
    className,
  );
}

type LinkArrowDirection = "right" | "up-right" | "left";

/**
 * Geometric 16px directional arrow SVG aligned to Daisy hairline icon strokes.
 */
export function LinkArrowIcon({
  direction = "right",
  className,
}: {
  direction?: LinkArrowDirection;
  className?: string;
}) {
  if (direction === "left") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn(
          "size-3.5 shrink-0 transition-transform duration-(--duration-control) ease-(--ease-control) group-hover/link:-translate-x-[3px] motion-reduce:transform-none",
          className,
        )}
      >
        <path d="M13 8H3.5" />
        <path d="M7.25 4.25 3.5 8l3.75 3.75" />
      </svg>
    );
  }

  if (direction === "up-right") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn(
          "size-3.5 shrink-0 transition-transform duration-(--duration-control) ease-(--ease-control) group-hover/link:translate-x-[2px] group-hover/link:-translate-y-[2px] motion-reduce:transform-none",
          className,
        )}
      >
        <path d="M4.5 11.5 11.5 4.5" />
        <path d="M6 4.5h5.5V10" />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(
        "size-3.5 shrink-0 transition-transform duration-(--duration-control) ease-(--ease-control) group-hover/link:translate-x-[3px] motion-reduce:transform-none",
        className,
      )}
    >
      <path d="M3 8h9.5" />
      <path d="M8.75 4.25 12.5 8l-3.75 3.75" />
    </svg>
  );
}

type ActionLinkBaseProps = LinkClassOptions & {
  iconDirection?: LinkArrowDirection;
};

type InternalActionLinkProps = Omit<
  ComponentProps<typeof Link>,
  keyof LinkClassOptions
> &
  ActionLinkBaseProps & {
    external?: false;
    download?: never;
  };

type ExternalActionLinkProps = Omit<
  ComponentProps<"a">,
  keyof LinkClassOptions
> &
  ActionLinkBaseProps & {
    href: string;
    external?: boolean;
  };

function ActionLinkContent({
  children,
  direction = "right",
}: {
  children: ReactNode;
  direction?: LinkArrowDirection;
}) {
  return (
    <>
      <span className="underline-offset-4 group-hover/link:underline">
        {children}
      </span>
      <LinkArrowIcon direction={direction} />
    </>
  );
}

/**
 * Unboxed link UI navigation control with trailing arrow icon and underline hover.
 */
export function ActionLink({
  className,
  tone = "primary",
  size = "sm",
  iconDirection,
  children,
  external,
  download,
  ...props
}: InternalActionLinkProps | ExternalActionLinkProps) {
  const classes = linkClasses({ tone, size, className });
  if (external || download !== undefined) {
    const { target, rel, ...anchorProps } = props as Omit<
      ExternalActionLinkProps,
      "className" | "tone" | "size" | "iconDirection" | "children" | "external"
    >;
    return (
      <a
        {...anchorProps}
        download={download}
        target={external ? (target ?? "_blank") : target}
        rel={external ? (rel ?? "noreferrer") : rel}
        className={classes}
      >
        <ActionLinkContent
          direction={iconDirection ?? (external ? "up-right" : "right")}
        >
          {children}
        </ActionLinkContent>
      </a>
    );
  }

  return (
    <Link {...(props as ComponentProps<typeof Link>)} className={classes}>
      <ActionLinkContent direction={iconDirection ?? "right"}>
        {children}
      </ActionLinkContent>
    </Link>
  );
}

type BackLinkProps = Omit<ComponentProps<typeof Link>, keyof LinkClassOptions> &
  LinkClassOptions;

/**
 * Unboxed link UI control with a leading `<-` arrow icon placed above dedicated
 * page headers to return to the parent data record or section.
 */
export function BackLink({
  className,
  tone = "muted",
  size = "sm",
  children,
  ...props
}: BackLinkProps) {
  return (
    <Link
      {...props}
      className={linkClasses({
        tone,
        size,
        className: cn(
          "w-fit max-w-full justify-self-start whitespace-normal text-left",
          className,
        ),
      })}
    >
      <LinkArrowIcon direction="left" />
      <span className="underline-offset-4 group-hover/link:underline">
        {children}
      </span>
    </Link>
  );
}

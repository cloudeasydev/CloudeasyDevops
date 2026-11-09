"use client";

import NextLink from "next/link";
import { usePathname, useRouter, useParams as useNextParams, useSearchParams as useNextSearchParams } from "next/navigation";
import { createContext, useContext, useEffect, type ComponentProps, type ReactNode } from "react";

type OutletValue = { user: unknown };

export const OutletContext = createContext<OutletValue | null>(null);

export function useOutletContext<T>() {
  const value = useContext(OutletContext);
  return (value ?? { user: undefined }) as T;
}

type LinkProps = Omit<ComponentProps<typeof NextLink>, "href"> & {
  to?: string;
  href?: string;
};

export function Link({ to, href, ...rest }: LinkProps) {
  return <NextLink href={href ?? to ?? "/"} {...rest} />;
}

export function useNavigate() {
  const router = useRouter();
  return (to: string, opts?: { replace?: boolean }) => {
    if (opts?.replace) router.replace(to);
    else router.push(to);
  };
}

export function useParams<T extends Record<string, string | string[] | undefined> = Record<string, string | undefined>>() {
  return useNextParams() as T;
}

export function useSearchParams() {
  const params = useNextSearchParams();
  return [params] as const;
}

export function useLocation() {
  const pathname = usePathname() ?? "/";
  return { pathname, search: "", hash: "" };
}

export function Navigate({ to, replace }: { to: string; replace?: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (replace) router.replace(to);
    else router.push(to);
  }, [replace, router, to]);
  return null;
}

export function NavLink({
  to,
  end,
  className,
  children,
  onClick,
}: {
  to: string;
  end?: boolean;
  className?: string | ((state: { isActive: boolean }) => string);
  children: ReactNode;
  onClick?: () => void;
}) {
  const pathname = usePathname() ?? "/";
  const isActive = end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);
  const cls = typeof className === "function" ? className({ isActive }) : className;
  return (
    <NextLink href={to} className={cls} onClick={onClick}>
      {children}
    </NextLink>
  );
}

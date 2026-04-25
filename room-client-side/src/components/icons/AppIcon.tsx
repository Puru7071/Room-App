"use client";

import "@/lib/iconify-register";
import { Icon, type IconProps } from "@iconify/react";

/** Renders icons from the Iconify catalog (browse names on https://icones.js.org/). */
export function AppIcon({ ssr = true, ...props }: IconProps) {
  return <Icon ssr={ssr} {...props} />;
}

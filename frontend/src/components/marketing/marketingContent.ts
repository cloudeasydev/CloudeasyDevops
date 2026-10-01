import { Github, Linkedin, Mail, Twitter } from "lucide-react";

export const DEFAULT_LEFT_FEATURES = [
  "Centralized Multi-Cloud Control: Seamlessly oversee AWS, GCP, Azure, and DigitalOcean instances in one place.",
  "Zero-Trust Secrets & Credential Vault: Securely manage and rotate encrypted application keys, tokens, and SSH credentials.",
  "API Studio: Test REST APIs, save requests, and run external URLs through a built-in proxy.",
  "Proactive Health & SSL Guard: Automated TLS certificate expiry alerts, latency benchmarking, and DNS health tracking.",
  "Streamlined CI/CD & Deployments: Automated release pipeline visibility, webhook alerts, and rollback readiness.",
];

export const SOCIAL_LINKS = [
  {
    name: "Gmail",
    href: "mailto:cloudeasydevops@gmail.com",
    icon: Mail,
    hoverClass: "hover:text-[#EA4335] hover:border-[#EA4335]/40 hover:bg-[#EA4335]/10",
  },
  {
    name: "LinkedIn",
    href: "https://www.linkedin.com/company/cloudeasydevops",
    icon: Linkedin,
    hoverClass: "hover:text-[#0A66C2] hover:border-[#0A66C2]/40 hover:bg-[#0A66C2]/10",
  },
  {
    name: "GitHub",
    href: "https://github.com/cloudeasydevops",
    icon: Github,
    hoverClass: "hover:text-hero-fg hover:border-hero-fg/40 hover:bg-hero-fg/10",
  },
  {
    name: "Twitter / X",
    href: "https://twitter.com/cloudeasydevops",
    icon: Twitter,
    hoverClass: "hover:text-[#1DA1F2] hover:border-[#1DA1F2]/40 hover:bg-[#1DA1F2]/10",
  },
] as const;

export type FooterConfig = {
  points?: string[];
  linkedinUrl?: string;
  githubUrl?: string;
  twitterUrl?: string;
  gmailUrl?: string;
  projectDescription?: string;
};

export function resolveSocialLinks(footer?: FooterConfig) {
  return SOCIAL_LINKS.map((s) => {
    if (s.name === "Gmail" && footer?.gmailUrl) return { ...s, href: footer.gmailUrl };
    if (s.name === "LinkedIn" && footer?.linkedinUrl) return { ...s, href: footer.linkedinUrl };
    if (s.name === "GitHub" && footer?.githubUrl) return { ...s, href: footer.githubUrl };
    if (s.name === "Twitter / X" && footer?.twitterUrl) return { ...s, href: footer.twitterUrl };
    return s;
  });
}

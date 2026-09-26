import gzIcon from "../../assets/service-icons/service-gz.svg?raw";
import ovtmIcon from "../../assets/service-icons/service-ovtm.svg?raw";
import rsIcon from "../../assets/service-icons/service-rs.svg?raw";
import saPpoIcon from "../../assets/service-icons/service-sa-ppo.svg?raw";
import siizIcon from "../../assets/service-icons/service-siiz.svg?raw";
import workshopIcon from "../../assets/service-icons/service-workshop.svg?raw";
import zbbrIcon from "../../assets/service-icons/service-zbbr.svg?raw";
import zuIcon from "../../assets/service-icons/service-zu.svg?raw";

export type ServiceIconName = "zbbr" | "zu" | "gz_kb" | "siiz" | "ovtm" | "rs" | "sa_ppo" | "workshop";

const iconUrls: Record<ServiceIconName, string> = {
  zbbr: zbbrIcon,
  zu: zuIcon,
  gz_kb: gzIcon,
  siiz: siizIcon,
  ovtm: ovtmIcon,
  rs: rsIcon,
  sa_ppo: saPpoIcon,
  workshop: workshopIcon,
};

const inlineIcons = Object.fromEntries(Object.entries(iconUrls).map(([name, source]) => [
  name,
  source
    .replace(/<\?xml[\s\S]*?\?>/giu, "")
    .replace(/<!DOCTYPE[\s\S]*?>/giu, "")
    .replace(/<!--[\s\S]*?-->/gu, "")
    .trim(),
])) as Record<ServiceIconName, string>;

export function ServiceIcon({ name, className = "" }: { name: ServiceIconName; className?: string }) {
  return <span aria-hidden="true" className={`service-icon service-icon--${name} ${className}`.trim()} dangerouslySetInnerHTML={{ __html: inlineIcons[name] }} />;
}

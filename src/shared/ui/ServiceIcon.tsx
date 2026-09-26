import type { CSSProperties } from "react";
import gzIcon from "../../assets/service-icons/service-gz.svg";
import ovtmIcon from "../../assets/service-icons/service-ovtm.svg";
import rsIcon from "../../assets/service-icons/service-rs.svg";
import saPpoIcon from "../../assets/service-icons/service-sa-ppo.svg";
import siizIcon from "../../assets/service-icons/service-siiz.svg";
import workshopIcon from "../../assets/service-icons/service-workshop.svg";
import zbbrIcon from "../../assets/service-icons/service-zbbr.svg";
import zuIcon from "../../assets/service-icons/service-zu.svg";

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

export function ServiceIcon({ name, className = "" }: { name: ServiceIconName; className?: string }) {
  const iconUrl = iconUrls[name];
  const style = {
    WebkitMaskImage: `url(${iconUrl})`,
    maskImage: `url(${iconUrl})`,
  } as CSSProperties;

  return <span aria-hidden="true" className={`service-icon service-icon--${name} ${className}`.trim()} style={style} />;
}

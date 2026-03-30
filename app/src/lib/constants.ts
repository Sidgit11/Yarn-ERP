export const GST_RATES = [
  { value: "0", label: "0%" },
  { value: "5", label: "5%" },
  { value: "12", label: "12%" },
  { value: "18", label: "18%" },
  { value: "28", label: "28%" },
] as const;

export const PAYMENT_MODES = ["Cash", "NEFT", "UPI", "Cheque", "RTGS"] as const;

export const FIBRE_TYPES = ["PC", "Cotton", "Polyester", "Viscose", "Nylon", "Acrylic", "Blended"] as const;

export const QUALITY_GRADES = ["Top", "Standard", "Economy"] as const;

export const CONTACT_TYPES = ["Mill", "Buyer", "Broker", "Transporter"] as const;

export const MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"] as const;

export const NAV_ITEMS = [
  { label: "Dashboard", href: "/", icon: "LayoutDashboard" },
  { label: "Purchases", href: "/purchases", icon: "ShoppingCart" },
  { label: "Sales", href: "/sales", icon: "TrendingUp" },
  { label: "Payments", href: "/payments", icon: "CreditCard" },
  { label: "CC Ledger", href: "/cc-ledger", icon: "Landmark" },
  { label: "Ledger", href: "/ledger", icon: "BookOpen" },
  { label: "Contacts", href: "/contacts", icon: "Users" },
  { label: "Products", href: "/products", icon: "Package" },
  { label: "Import", href: "/import", icon: "Upload" },
  { label: "Settings", href: "/settings", icon: "Settings" },
  { label: "Recon", href: "/recon", icon: "FileCheck" },
] as const;

// Color themes for dashboard cards — modern desaturated with accent stripe
export const CARD_THEMES = {
  cc: { bg: "bg-white", border: "border-gray-200", accent: "bg-red-500", accentText: "text-red-600", iconBg: "bg-red-50", text: "text-gray-900" },
  money: { bg: "bg-white", border: "border-gray-200", accent: "bg-blue-500", accentText: "text-blue-600", iconBg: "bg-blue-50", text: "text-gray-900" },
  gst: { bg: "bg-white", border: "border-gray-200", accent: "bg-teal-500", accentText: "text-teal-600", iconBg: "bg-teal-50", text: "text-gray-900" },
  margins: { bg: "bg-white", border: "border-gray-200", accent: "bg-green-500", accentText: "text-green-600", iconBg: "bg-green-50", text: "text-gray-900" },
  inventory: { bg: "bg-white", border: "border-gray-200", accent: "bg-violet-500", accentText: "text-violet-600", iconBg: "bg-violet-50", text: "text-gray-900" },
  stats: { bg: "bg-white", border: "border-gray-200", accent: "bg-orange-500", accentText: "text-orange-600", iconBg: "bg-orange-50", text: "text-gray-900" },
} as const;

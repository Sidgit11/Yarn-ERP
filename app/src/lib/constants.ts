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

export const CONTACT_TYPES = ["Mill", "Buyer", "Broker"] as const;

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
  { label: "Settings", href: "/settings", icon: "Settings" },
  { label: "Recon", href: "/recon", icon: "FileCheck" },
] as const;

// Color themes for dashboard cards (from UI spec)
export const CARD_THEMES = {
  cc: { bg: "bg-red-50", border: "border-red-200", header: "bg-red-600", text: "text-red-800" },
  money: { bg: "bg-blue-50", border: "border-blue-200", header: "bg-blue-600", text: "text-blue-800" },
  gst: { bg: "bg-teal-50", border: "border-teal-200", header: "bg-teal-600", text: "text-teal-800" },
  margins: { bg: "bg-green-50", border: "border-green-200", header: "bg-green-600", text: "text-green-800" },
  inventory: { bg: "bg-purple-50", border: "border-purple-200", header: "bg-purple-600", text: "text-purple-800" },
  stats: { bg: "bg-orange-50", border: "border-orange-200", header: "bg-orange-600", text: "text-orange-800" },
} as const;

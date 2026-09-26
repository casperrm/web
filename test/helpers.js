export function validSubmission(overrides = {}) {
  return {
    fullName: "Rana Haddad",
    businessName: "Haddad Bakery",
    email: "rana@haddadbakery.com",
    whatsapp: "+961 3 123 456",
    businessDescription: "Family-run bakery in Beirut",
    websiteType: "Restaurant / Menu Website",
    websiteTypeOther: "",
    pageCount: "4–6",
    features: ["WhatsApp", "Google Maps", "Other"],
    featuresOther: "Online ordering",
    hasBranding: "Yes",
    hasDomain: "I'm not sure",
    hasContent: "Partially",
    languages: ["Arabic", "English"],
    existingWebsite: "haddadbakery.com",
    inspiration: "",
    mainGoal: "Show our menu and get more catering orders.",
    additionalInfo: "",
    ...overrides,
  };
}

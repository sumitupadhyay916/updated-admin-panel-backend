const PACKAGING_TO_DB = {
  Box: 'Box',
  'Velvet Box': 'Velvet_Box',
  'Wooden Case': 'Wooden_Case',
  'Gift Wrap': 'Gift_Wrap',
  Standard: 'Standard',
};

const PACKAGING_FROM_DB = Object.fromEntries(
  Object.entries(PACKAGING_TO_DB).map(([k, v]) => [v, k]),
);

const OCCASION_TO_DB = {
  Diwali: 'Diwali',
  Puja: 'Puja',
  Wedding: 'Wedding',
  Festival: 'Festival',
  Housewarming: 'Housewarming',
  Birthday: 'Birthday',
  Anniversary: 'Anniversary',
  Corporate: 'Corporate',
  'Daily Worship': 'Daily_Worship',
  'Tuesday Special': 'Tuesday_Special',
  Navratri: 'Navratri',
  'Ganesh Chaturthi': 'Ganesh_Chaturthi',
  'Vasant Panchami': 'Vasant_Panchami',
};

const OCCASION_FROM_DB = Object.fromEntries(
  Object.entries(OCCASION_TO_DB).map(([k, v]) => [v, k]),
);

const SUPPORT_SLUG_TO_DB = {
  'help-center': 'help_center',
  faqs: 'faqs',
  'privacy-policy': 'privacy_policy',
  'terms-conditions': 'terms_conditions',
};

const SUPPORT_SLUG_FROM_DB = Object.fromEntries(
  Object.entries(SUPPORT_SLUG_TO_DB).map(([k, v]) => [v, k]),
);

function toDbPackagingType(value) {
  return PACKAGING_TO_DB[value] || value;
}

function fromDbPackagingType(value) {
  return PACKAGING_FROM_DB[value] || value;
}

function toDbOccasion(value) {
  return OCCASION_TO_DB[value] || value;
}

function fromDbOccasion(value) {
  return OCCASION_FROM_DB[value] || value;
}

function toDbSupportSlug(value) {
  return SUPPORT_SLUG_TO_DB[value] || value;
}

function fromDbSupportSlug(value) {
  return SUPPORT_SLUG_FROM_DB[value] || value;
}

module.exports = {
  toDbPackagingType,
  fromDbPackagingType,
  toDbOccasion,
  fromDbOccasion,
  toDbSupportSlug,
  fromDbSupportSlug,
};



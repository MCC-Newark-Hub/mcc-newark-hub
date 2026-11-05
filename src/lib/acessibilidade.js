// The Acessibilidade class of the CIA (children's classes). A child marked in their member record
// (members.acessibilidade, migration 047) is registered with registrations.acessibilidade on.
export const CIA_CATEGORIES = ["0-3", "Criança", "Intermediário", "Adolescente"];
export const isCiaCategory = (category) => CIA_CATEGORIES.includes(category);

// Whether a registration of `member` in `category` goes to Acessibilidade. Only CIA categories do:
// someone who grew into Jovem/Adulto keeps the mark in their record but is no longer in a CIA class.
export const regAcessibilidade = (member, category = member?.category) => !!member?.acessibilidade && isCiaCategory(category);

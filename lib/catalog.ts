import type { Product } from './domain';
const v = (id: string, label: string, value: string, priceAdjustment = 0) => ({
  id,
  label,
  value,
  priceAdjustment,
});
export const sampleProducts: Product[] = [
  {
    id: 'prod_krishna',
    slug: 'krishna-idol',
    name: 'Krishna Idol',
    shortDescription:
      'A graceful decorative piece, personalized to suit your space.',
    description:
      'Choose the size, colour and optional lighting to shape this Krishna-inspired decorative object around your home.',
    category: 'Decor',
    basePrice: 699,
    compareAtPrice: 899,
    active: true,
    featured: true,
    stockMode: 'made_to_order',
    leadTime: '4–7 working days',
    images: [
      '/demo-products/krishna-idol-main.webp',
      '/demo-products/krishna-idol-detail.webp',
    ],
    options: [
      {
        id: 'opt_ksize',
        key: 'size',
        name: 'Size',
        type: 'radio',
        required: true,
        values: [
          v('ks', 'Small', 'small'),
          v('km', 'Medium', 'medium', 300),
          v('kl', 'Large', 'large', 700),
        ],
      },
      {
        id: 'opt_kcolour',
        key: 'colour',
        name: 'Colour',
        type: 'select',
        required: true,
        values: [
          v('kw', 'Warm White', 'white'),
          v('ksd', 'Sandstone', 'sandstone'),
          v('kg', 'Deep Green', 'green', 100),
        ],
      },
      {
        id: 'opt_klight',
        key: 'lighting',
        name: 'Lighting',
        type: 'radio',
        required: true,
        values: [v('kln', 'No', 'no'), v('kly', 'Yes', 'yes', 200)],
      },
    ],
  },
  {
    id: 'prod_nameplate',
    slug: 'custom-name-plate',
    name: 'Custom Name Plate',
    shortDescription:
      'A modern statement for your door, made with your name and style.',
    description:
      'Personalize the name, size, colour and design style. We review your details before the name plate moves into production.',
    category: 'Home',
    basePrice: 899,
    active: true,
    featured: true,
    stockMode: 'made_to_order',
    leadTime: '5–8 working days',
    images: [
      '/demo-products/name-plate-main.webp',
      '/demo-products/name-plate-detail.webp',
    ],
    options: [
      {
        id: 'opt_nptext',
        key: 'text',
        name: 'Name / text',
        type: 'text',
        required: true,
        placeholder: 'e.g. YOGESH',
      },
      {
        id: 'opt_npsize',
        key: 'size',
        name: 'Size',
        type: 'select',
        required: true,
        values: [
          v('np20', '20 cm', '20cm'),
          v('np30', '30 cm', '30cm', 400),
          v('np40', '40 cm', '40cm', 800),
        ],
      },
      {
        id: 'opt_npcolour',
        key: 'colour',
        name: 'Colour',
        type: 'select',
        required: true,
        values: [
          v('npb', 'Black / Gold', 'black-gold', 150),
          v('npw', 'White / Oak', 'white-oak'),
          v('npg', 'Black / Orange', 'black-orange', 150),
        ],
      },
      {
        id: 'opt_npstyle',
        key: 'style',
        name: 'Style',
        type: 'radio',
        required: true,
        values: [
          v('npm', 'Modern', 'modern'),
          v('npc', 'Classic', 'classic'),
          v('npl', 'Minimal', 'minimal'),
        ],
      },
    ],
  },
  {
    id: 'prod_gift',
    slug: 'personalized-gift',
    name: 'Personalized Gift',
    shortDescription:
      'A meaningful little object made for one particular person.',
    description:
      'Add a name, occasion and personal note, then choose the look that feels right for the person receiving it.',
    category: 'Gifts',
    basePrice: 499,
    active: true,
    featured: true,
    stockMode: 'made_to_order',
    leadTime: '3–6 working days',
    images: ['/demo-products/personalized-gift-main.webp'],
    options: [
      {
        id: 'opt_gname',
        key: 'name',
        name: 'Name',
        type: 'text',
        required: true,
        placeholder: 'Name to personalize',
      },
      {
        id: 'opt_goccasion',
        key: 'occasion',
        name: 'Occasion',
        type: 'select',
        required: true,
        values: [
          v('gb', 'Birthday', 'birthday'),
          v('ga', 'Anniversary', 'anniversary'),
          v('gh', 'Housewarming', 'housewarming'),
          v('go', 'Other', 'other'),
        ],
      },
      {
        id: 'opt_gcolour',
        key: 'colour',
        name: 'Colour',
        type: 'select',
        required: true,
        values: [
          v('gp', 'Pearl', 'pearl'),
          v('gt', 'Orange', 'orange'),
          v('gf', 'Deep Green', 'green'),
        ],
      },
      {
        id: 'opt_gnote',
        key: 'notes',
        name: 'Personalization notes',
        type: 'textarea',
        required: false,
        placeholder: 'Tell us what would make it special',
      },
    ],
  },
  {
    id: 'prod_custom',
    slug: 'custom-3d-print',
    name: 'Custom 3D Print',
    shortDescription:
      'Bring a sketch, file, photo or idea—we’ll help turn it into an object.',
    description:
      'Share the idea, approximate dimensions, quantity and any useful references. We’ll review it and come back with a clear custom quote.',
    category: 'Custom',
    basePrice: 0,
    active: true,
    featured: true,
    stockMode: 'quote_only',
    leadTime: 'Quoted after review',
    images: [
      '/demo-products/custom-3d-print-main.webp',
      '/demo-products/custom-workflow-wide.webp',
    ],
    options: [],
  },
];
export const faqs = [
  {
    q: 'Can I request a design that is not in the shop?',
    a: 'Yes. Use the Custom Print form to describe your idea and upload reference files privately. We’ll review it and get back to you with the next steps.',
  },
  {
    q: 'How long does manufacturing take?',
    a: 'Products are made to order. Timing depends on the model and current production queue. Your order shows an estimate when print-time information is available; custom requests receive an owner-reviewed estimate.',
  },
  {
    q: 'How do I pay?',
    a: 'Choose Cash on Delivery to place a standard order entirely on this website. For UPI, your pending order is saved first, then you can continue on WhatsApp with the order number and exact amount. Custom requests require an approved quote and full UPI payment before production.',
  },
  {
    q: 'Can I see a preview before production?',
    a: 'For text-based custom products such as name plates, a design preview can be discussed during WhatsApp confirmation before production begins.',
  },
];
export function getProduct(slug: string) {
  return sampleProducts.find((p) => p.slug === slug);
}

import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
const timestamps = {
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
};
export const products = sqliteTable(
  'products',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    productType: text('product_type').notNull().default('normal'),
    internalUnitCost: integer('internal_unit_cost'),
    sourceFolder: text('source_folder'),
    shortDescription: text('short_description').notNull(),
    description: text('description').notNull(),
    category: text('category').notNull(),
    categoryId: text('category_id'),
    basePrice: integer('base_price').notNull(),
    compareAtPrice: integer('compare_at_price'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    featured: integer('featured', { mode: 'boolean' }).notNull().default(false),
    stockMode: text('stock_mode').notNull().default('made_to_order'),
    stockQuantity: integer('stock_quantity'),
    leadTime: text('lead_time').notNull().default('3–7 working days'),
    images: text('images', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default([]),
    sku: text('sku'),
    status: text('status').notNull().default('active'),
    publishingStatus: text('publishing_status').notNull().default('draft'),
    availability: text('availability').notNull().default('available'),
    dimensions: text('dimensions'),
    width: real('width'),
    depth: real('depth'),
    height: real('height'),
    dimensionUnit: text('dimension_unit').notNull().default('cm'),
    dimensionDisplayOverride: text('dimension_display_override'),
    material: text('material'),
    deliveryNotes: text('delivery_notes'),
    careInstructions: text('care_instructions'),
    commercialLicenseStatus: text('commercial_license_status'),
    estimatedPrintMinutes: integer('estimated_print_minutes'),
    filamentGrams: real('filament_grams'),
    supportDifficulty: text('support_difficulty'),
    printProfileNotes: text('print_profile_notes'),
    internalProductionNotes: text('internal_production_notes'),
    seoTitle: text('seo_title'),
    seoDescription: text('seo_description'),
    tags: text('tags', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default([]),
    finishReferenceImages: text('finish_reference_images', { mode: 'json' })
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('idx_products_slug').on(t.slug),
    index('idx_products_active_featured').on(t.active, t.featured),
    uniqueIndex('idx_products_sku').on(t.sku),
    index('idx_products_category_publish').on(
      t.categoryId,
      t.publishingStatus,
      t.availability,
    ),
  ],
);
export const productVariants = sqliteTable(
  'product_variants',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    sku: text('sku').notNull(),
    priceAdjustment: integer('price_adjustment').notNull().default(0),
    finishId: text('finish_id'),
    sellingPrice: integer('selling_price'),
    originalPrice: integer('original_price'),
    exactImageId: text('exact_image_id'),
    availability: text('availability').notNull().default('available'),
    sortOrder: integer('sort_order').notNull().default(0),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index('idx_variants_product').on(t.productId),
    uniqueIndex('idx_variants_sku').on(t.sku),
  ],
);
export const productOptions = sqliteTable(
  'product_options',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    key: text('key').notNull(),
    type: text('type').notNull(),
    required: integer('required', { mode: 'boolean' }).notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    placeholder: text('placeholder'),
    ...timestamps,
  },
  (t) => [index('idx_options_product').on(t.productId)],
);
export const productOptionValues = sqliteTable(
  'product_option_values',
  {
    id: text('id').primaryKey(),
    optionId: text('option_id')
      .notNull()
      .references(() => productOptions.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    value: text('value').notNull(),
    priceAdjustment: integer('price_adjustment').notNull().default(0),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => [index('idx_option_values_option').on(t.optionId)],
);
export const customers = sqliteTable(
  'customers',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    mobile: text('mobile').notNull(),
    email: text('email'),
    emailNormalized: text('email_normalized'),
    emailVerifiedAt: text('email_verified_at'),
    authMethod: text('auth_method').notNull().default('legacy'),
    googleSubject: text('google_subject'),
    notes: text('notes'),
    lastOrderAt: text('last_order_at'),
    orderCount: integer('order_count').notNull().default(0),
    totalSpent: integer('total_spent').notNull().default(0),
    passwordHash: text('password_hash'),
    isTest: integer('is_test', { mode: 'boolean' }).notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('idx_customers_mobile').on(t.mobile),
    uniqueIndex('idx_customers_email_normalized').on(t.emailNormalized),
    uniqueIndex('idx_customers_google_subject').on(t.googleSubject),
  ],
);
export const customerAddresses = sqliteTable(
  'customer_addresses',
  {
    id: text('id').primaryKey(),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    line1: text('line1').notNull(),
    line2: text('line2'),
    locality: text('locality').notNull(),
    city: text('city').notNull(),
    state: text('state').notNull(),
    pinCode: text('pin_code').notNull(),
    landmark: text('landmark'),
    notes: text('notes'),
    label: text('label'),
    latitude: real('latitude'),
    longitude: real('longitude'),
    isDefault: integer('is_default', { mode: 'boolean' })
      .notNull()
      .default(false),
    ...timestamps,
  },
  (t) => [index('idx_addresses_customer').on(t.customerId)],
);
export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    customerId: text('customer_id').references(() => customers.id),
    currentProductId: text('current_product_id'),
    checkoutProgress: text('checkout_progress').notNull().default('browsing'),
    companionContext: text('companion_context', { mode: 'json' }).$type<
      Record<string, unknown>
    >(),
    intentScore: integer('intent_score').notNull().default(0),
    intentStage: text('intent_stage').notNull().default('explorer'),
    companionDismissals: integer('companion_dismissals').notNull().default(0),
    companionEngaged: integer('companion_engaged', { mode: 'boolean' })
      .notNull()
      .default(false),
    source: text('source'),
    campaign: text('campaign'),
    lastActivity: text('last_activity')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    ...timestamps,
  },
  (t) => [
    index('idx_sessions_customer').on(t.customerId),
    index('idx_sessions_intent').on(t.intentStage, t.lastActivity),
  ],
);
export const carts = sqliteTable(
  'carts',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('active'),
    ...timestamps,
  },
  (t) => [uniqueIndex('idx_carts_active_session').on(t.sessionId, t.status)],
);
export const cartItems = sqliteTable(
  'cart_items',
  {
    id: text('id').primaryKey(),
    cartId: text('cart_id')
      .notNull()
      .references(() => carts.id, { onDelete: 'cascade' }),
    productId: text('product_id')
      .notNull()
      .references(() => products.id),
    variantId: text('variant_id').references(() => productVariants.id),
    quantity: integer('quantity').notNull(),
    selections: text('selections', { mode: 'json' })
      .$type<Record<string, string | number | boolean>>()
      .notNull(),
    unitPrice: integer('unit_price').notNull(),
    ...timestamps,
  },
  (t) => [index('idx_cart_items_cart').on(t.cartId)],
);
export const orders = sqliteTable(
  'orders',
  {
    id: text('id').primaryKey(),
    orderNumber: text('order_number').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    checkoutFingerprint: text('checkout_fingerprint'),
    sessionId: text('session_id'),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    addressId: text('address_id')
      .notNull()
      .references(() => customerAddresses.id),
    conversationId: text('conversation_id'),
    companionEngaged: integer('companion_engaged', { mode: 'boolean' })
      .notNull()
      .default(false),
    companionAssistedCart: integer('companion_assisted_cart', {
      mode: 'boolean',
    })
      .notNull()
      .default(false),
    companionAssistedCheckout: integer('companion_assisted_checkout', {
      mode: 'boolean',
    })
      .notNull()
      .default(false),
    campaignAttribution: text('campaign_attribution', { mode: 'json' }).$type<
      Record<string, unknown>
    >(),
    status: text('status').notNull().default('awaiting_confirmation'),
    paymentStatus: text('payment_status').notNull().default('unpaid'),
    paymentMethod: text('payment_method'),
    customerEmail: text('customer_email'),
    subtotal: integer('subtotal').notNull(),
    deliveryAmount: integer('delivery_amount').notNull(),
    total: integer('total').notNull(),
    customerNotes: text('customer_notes'),
    internalNotes: text('internal_notes'),
    revision: integer('revision').notNull().default(0),
    lastOperationId: text('last_operation_id'),
    isTest: integer('is_test', { mode: 'boolean' }).notNull().default(false),
    orderType: text('order_type').notNull().default('normal'),
    latitude: real('latitude'),
    longitude: real('longitude'),
    estimatedDeliveryDate: text('estimated_delivery_date'),
    promisedDeliveryDate: text('promised_delivery_date'),
    deliveryWindow: text('delivery_window'),
    deliveredAt: text('delivered_at'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('idx_orders_number').on(t.orderNumber),
    uniqueIndex('idx_orders_idempotency').on(t.idempotencyKey),
    index('idx_orders_status_created').on(t.status, t.createdAt),
    index('idx_orders_customer').on(t.customerId),
    index('idx_orders_companion').on(t.companionEngaged, t.createdAt),
  ],
);
export const orderItems = sqliteTable(
  'order_items',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    productId: text('product_id').notNull(),
    productName: text('product_name').notNull(),
    productSku: text('product_sku'),
    variantId: text('variant_id'),
    variantName: text('variant_name'),
    selectedFinish: text('selected_finish'),
    quantity: integer('quantity').notNull(),
    unitPrice: integer('unit_price').notNull(),
    lineTotal: integer('line_total').notNull(),
    estimatedPrintMinutes: integer('estimated_print_minutes'),
    unitCost: integer('unit_cost'),
    productionStatus: text('production_status').notNull().default('queued'),
    scheduledDate: text('scheduled_date'),
    qcChecklist: text('qc_checklist'),
    qcPassedAt: text('qc_passed_at'),
    packedAt: text('packed_at'),
    reprintCount: integer('reprint_count').notNull().default(0),
    ...timestamps,
  },
  (t) => [index('idx_order_items_order').on(t.orderId)],
);
export const orderItemCustomizations = sqliteTable(
  'order_item_customizations',
  {
    id: text('id').primaryKey(),
    orderItemId: text('order_item_id')
      .notNull()
      .references(() => orderItems.id, { onDelete: 'cascade' }),
    optionKey: text('option_key').notNull(),
    optionName: text('option_name').notNull(),
    value: text('value').notNull(),
    priceAdjustment: integer('price_adjustment').notNull().default(0),
    ...timestamps,
  },
  (t) => [index('idx_customizations_item').on(t.orderItemId)],
);
export const orderTimeline = sqliteTable(
  'order_timeline',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    fromStatus: text('from_status'),
    toStatus: text('to_status').notNull(),
    note: text('note'),
    actor: text('actor').notNull().default('admin'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index('idx_timeline_order').on(t.orderId)],
);
export const conversations = sqliteTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').notNull(),
    customerId: text('customer_id'),
    channel: text('channel').notNull().default('web'),
    status: text('status').notNull().default('open'),
    summary: text('summary'),
    isTest: integer('is_test', { mode: 'boolean' }).notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index('idx_conversations_session').on(t.sessionId),
    index('idx_conversations_customer').on(t.customerId),
  ],
);
export const conversationMessages = sqliteTable(
  'conversation_messages',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    message: text('message').notNull(),
    metadata: text('metadata', { mode: 'json' }).$type<
      Record<string, unknown>
    >(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index('idx_messages_conversation_created').on(
      t.conversationId,
      t.createdAt,
    ),
  ],
);
export const customQuoteRequests = sqliteTable(
  'custom_quote_requests',
  {
    id: text('id').primaryKey(),
    requestNumber: text('request_number').notNull(),
    sessionId: text('session_id'),
    customerId: text('customer_id'),
    name: text('name').notNull(),
    mobile: text('mobile').notNull(),
    email: text('email'),
    description: text('description').notNull(),
    dimensions: text('dimensions'),
    quantity: integer('quantity').notNull().default(1),
    desiredColour: text('desired_colour'),
    productId: text('product_id'),
    specifications: text('specifications'),
    quotedPrice: integer('quoted_price'),
    deliveryAmount: integer('delivery_amount'),
    deliveryEstimate: text('delivery_estimate'),
    quoteVersion: integer('quote_version').notNull().default(0),
    approvedVersion: integer('approved_version'),
    approvedAt: text('approved_at'),
    orderId: text('order_id'),
    budget: integer('budget'),
    requiredBy: text('required_by'),
    notes: text('notes'),
    status: text('status').notNull().default('new'),
    isTest: integer('is_test', { mode: 'boolean' }).notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('idx_quote_number').on(t.requestNumber),
    index('idx_quote_status_created').on(t.status, t.createdAt),
  ],
);
export const uploadedFiles = sqliteTable(
  'uploaded_files',
  {
    id: text('id').primaryKey(),
    quoteRequestId: text('quote_request_id').references(
      () => customQuoteRequests.id,
      { onDelete: 'cascade' },
    ),
    storageKey: text('storage_key').notNull(),
    originalName: text('original_name').notNull(),
    contentType: text('content_type').notNull(),
    size: integer('size').notNull(),
    private: integer('private', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index('idx_files_quote').on(t.quoteRequestId)],
);
export const analyticsEvents = sqliteTable(
  'analytics_events',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id'),
    customerId: text('customer_id'),
    name: text('name').notNull(),
    path: text('path'),
    productId: text('product_id'),
    orderId: text('order_id'),
    metadata: text('metadata', { mode: 'json' }).$type<
      Record<string, unknown>
    >(),
    isTest: integer('is_test', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index('idx_events_name_created').on(t.name, t.createdAt),
    index('idx_events_session').on(t.sessionId),
  ],
);
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).$type<unknown>().notNull(),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const deliveryPeople = sqliteTable('delivery_people', {
  id: text('id').primaryKey(), name: text('name').notNull(), mobile: text('mobile').notNull(),
  passwordHash: text('password_hash').notNull(), active: integer('active').notNull().default(1), ...timestamps,
}, t => [uniqueIndex('idx_delivery_people_mobile').on(t.mobile)]);
export const productionAllocations = sqliteTable('production_allocations', {
  id: text('id').primaryKey(), orderItemId: text('order_item_id').notNull().references(() => orderItems.id),
  productionDate: text('production_date').notNull(), minutes: integer('minutes').notNull(),
}, t => [index('idx_allocations_date').on(t.productionDate), index('idx_allocations_item').on(t.orderItemId)]);
export const deliverySessions = sqliteTable('delivery_sessions', {
  id: text('id').primaryKey(), personId: text('person_id').notNull().references(() => deliveryPeople.id),
  tokenHash: text('token_hash').notNull(), expiresAt: text('expires_at').notNull(), createdAt: text('created_at').notNull(),
}, t => [uniqueIndex('idx_delivery_session_token').on(t.tokenHash)]);
export const deliveryBatches = sqliteTable('delivery_batches', {
  id: text('id').primaryKey(), personId: text('person_id').notNull().references(() => deliveryPeople.id),
  deliveryDate: text('delivery_date').notNull(), timeWindow: text('time_window').notNull(),
  status: text('status').notNull().default('scheduled'), startedAt: text('started_at'),
  isTest: integer('is_test', { mode: 'boolean' }).notNull().default(false), ...timestamps,
}, t => [index('idx_delivery_batch_person').on(t.personId,t.deliveryDate)]);
export const deliveryStops = sqliteTable('delivery_stops', {
  id: text('id').primaryKey(), batchId: text('batch_id').notNull().references(() => deliveryBatches.id),
  orderId: text('order_id').notNull().references(() => orders.id), sortOrder: integer('sort_order').notNull(),
  status: text('status').notNull().default('pending'), availabilityNote: text('availability_note'), failureReason: text('failure_reason'),
  arrivedAt: text('arrived_at'), completedAt: text('completed_at'),
  openBoxAcceptedAt: text('open_box_accepted_at'), paymentRecordedAt: text('payment_recorded_at'), proofId: text('proof_id'),
  ...timestamps,
}, t => [uniqueIndex('idx_delivery_stop_batch_order').on(t.batchId,t.orderId), index('idx_delivery_stop_order').on(t.orderId)]);
export const paymentCollections = sqliteTable('payment_collections', {
  id: text('id').primaryKey(), orderId: text('order_id').notNull().references(() => orders.id),
  personId: text('person_id').references(() => deliveryPeople.id), method: text('method').notNull(),
  amountDue: integer('amount_due').notNull(), amountCollected: integer('amount_collected').notNull(),
  settlementStatus: text('settlement_status').notNull().default('pending'), settledAt: text('settled_at'),
  collectedAt: text('collected_at').notNull(),
}, t => [uniqueIndex('idx_payment_collection_order').on(t.orderId)]);
export const cashSettlements = sqliteTable('cash_settlements', {
  id: text('id').primaryKey(),
  personId: text('person_id').notNull().references(() => deliveryPeople.id),
  amount: integer('amount').notNull(),
  note: text('note'),
  actor: text('actor').notNull().default('admin'),
  createdAt: text('created_at').notNull(),
}, t => [index('idx_cash_settlements_person_created').on(t.personId, t.createdAt)]);
export const deliveryProofs = sqliteTable('delivery_proofs', {
  id: text('id').primaryKey(), orderId: text('order_id').notNull().references(() => orders.id),
  personId: text('person_id').notNull().references(() => deliveryPeople.id), storageKey: text('storage_key').notNull(),
  contentType: text('content_type').notNull(), size: integer('size').notNull(), consentAt: text('consent_at').notNull(),
  createdAt: text('created_at').notNull(),
}, t => [index('idx_delivery_proof_order').on(t.orderId)]);
export const deliveryOtps = sqliteTable('delivery_otps', {
  id: text('id').primaryKey(), stopId: text('stop_id').notNull().references(() => deliveryStops.id, { onDelete: 'cascade' }),
  orderId: text('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }), personId: text('person_id').notNull().references(() => deliveryPeople.id),
  nonce: text('nonce').notNull(), salt: text('salt').notNull(), codeHash: text('code_hash').notNull(), attempts: integer('attempts').notNull().default(0),
  generationNumber: integer('generation_number').notNull().default(1), expiresAt: text('expires_at').notNull(), verifiedAt: text('verified_at'), consumedAt: text('consumed_at'), invalidatedAt: text('invalidated_at'),
  overrideReason: text('override_reason'), overrideActor: text('override_actor'), generatedAt: text('generated_at').notNull(), updatedAt: text('updated_at').notNull(),
}, t => [index('idx_delivery_otps_stop_generated').on(t.stopId, t.generatedAt), index('idx_delivery_otps_order').on(t.orderId)]);
export const adminOrderAcknowledgements = sqliteTable('admin_order_acknowledgements', {
  orderId: text('order_id').primaryKey().references(() => orders.id, { onDelete: 'cascade' }), acknowledgedAt: text('acknowledged_at').notNull(), actor: text('actor').notNull().default('admin'),
});
export const orderCosts = sqliteTable('order_costs', {
  id: text('id').primaryKey(), orderId: text('order_id').notNull().references(() => orders.id),
  category: text('category').notNull(), amount: integer('amount').notNull(), note: text('note'), createdAt: text('created_at').notNull(),
}, t => [index('idx_costs_order').on(t.orderId)]);
export const reviews = sqliteTable('reviews', {
  id: text('id').primaryKey(), orderItemId: text('order_item_id').notNull().references(() => orderItems.id),
  customerId: text('customer_id').notNull().references(() => customers.id), productId: text('product_id').notNull(),
  rating: integer('rating').notNull(), body: text('body').notNull(), status: text('status').notNull().default('published'),
  moderationReason: text('moderation_reason'), photoKey: text('photo_key'), photoType: text('photo_type'), ...timestamps,
}, t => [uniqueIndex('idx_review_order_item').on(t.orderItemId), index('idx_review_product_status').on(t.productId,t.status)]);
export const commerceOutbox = sqliteTable('commerce_outbox', {
  id: text('id').primaryKey(), eventName: text('event_name').notNull(), orderId: text('order_id').references(() => orders.id),
  payload: text('payload').notNull(), status: text('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0), lastError: text('last_error'), deliveredAt: text('delivered_at'),
  isTest: integer('is_test', { mode: 'boolean' }).notNull().default(false), createdAt: text('created_at').notNull(),
}, t => [index('idx_outbox_status').on(t.status,t.createdAt)]);
export const aiProviderSettings = sqliteTable('ai_provider_settings', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull().default('openai'),
  model: text('model').notNull().default('gpt-5.6-luna'),
  apiKeyCiphertext: text('api_key_ciphertext'),
  apiKeyIv: text('api_key_iv'),
  secretVersion: integer('secret_version').notNull().default(1),
  connectionStatus: text('connection_status')
    .notNull()
    .default('not_configured'),
  lastTestedAt: text('last_tested_at'),
  ...timestamps,
});
export const adminAuditEvents = sqliteTable(
  'admin_audit_events',
  {
    id: text('id').primaryKey(),
    action: text('action').notNull(),
    metadata: text('metadata', { mode: 'json' }).$type<
      Record<string, unknown>
    >(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index('idx_admin_audit_action_created').on(t.action, t.createdAt)],
);
export const faqs = sqliteTable('faqs', {
  id: text('id').primaryKey(),
  question: text('question').notNull(),
  answer: text('answer').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps,
});
export const adminUsers = sqliteTable(
  'admin_users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    lastLoginAt: text('last_login_at'),
    ...timestamps,
  },
  (t) => [uniqueIndex('idx_admin_email').on(t.email)],
);

export const categories = sqliteTable(
  'categories',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    image: text('image'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex('idx_categories_slug').on(t.slug)],
);

export const globalFinishes = sqliteTable(
  'global_finishes',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    swatch: text('swatch'),
    referenceImageId: text('reference_image_id'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    internalNotes: text('internal_notes'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('idx_global_finishes_slug').on(t.slug),
    uniqueIndex('idx_global_finishes_name').on(t.name),
  ],
);

export const productImages = sqliteTable(
  'product_images',
  {
    id: text('id').primaryKey(),
    productId: text('product_id').references(() => products.id, {
      onDelete: 'cascade',
    }),
    globalFinishId: text('global_finish_id').references(
      () => globalFinishes.id,
      { onDelete: 'cascade' },
    ),
    storageKey: text('storage_key').notNull(),
    originalName: text('original_name').notNull(),
    contentType: text('content_type').notNull(),
    size: integer('size').notNull(),
    role: text('role').notNull().default('gallery'),
    altText: text('alt_text'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index('idx_product_images_product').on(t.productId, t.sortOrder),
    index('idx_product_images_finish').on(t.globalFinishId),
  ],
);

export const tags = sqliteTable(
  'tags',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex('idx_tags_slug').on(t.slug)],
);

export const productTags = sqliteTable(
  'product_tags',
  {
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [uniqueIndex('idx_product_tag_pair').on(t.productId, t.tagId)],
);

export const skuSequences = sqliteTable('sku_sequences', {
  prefix: text('prefix').primaryKey(),
  value: integer('value').notNull().default(0),
});

export const relatedProducts = sqliteTable(
  'related_products',
  {
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    relatedProductId: text('related_product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [
    uniqueIndex('idx_related_product_pair').on(t.productId, t.relatedProductId),
  ],
);

export const customerSessions = sqliteTable(
  'customer_sessions',
  {
    id: text('id').primaryKey(),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: text('expires_at').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    lastUsedAt: text('last_used_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    uniqueIndex('idx_customer_session_token').on(t.tokenHash),
    index('idx_customer_session_customer').on(t.customerId),
  ],
);

export const customerAuthTokens = sqliteTable(
  'customer_auth_tokens',
  {
    id: text('id').primaryKey(),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    purpose: text('purpose').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: text('expires_at').notNull(),
    usedAt: text('used_at'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    uniqueIndex('idx_customer_auth_token_hash').on(t.tokenHash),
    index('idx_customer_auth_token_customer').on(t.customerId, t.purpose),
  ],
);

export const googleOauthStates = sqliteTable(
  'google_oauth_states',
  {
    id: text('id').primaryKey(),
    stateHash: text('state_hash').notNull(),
    nonce: text('nonce').notNull(),
    codeVerifier: text('code_verifier').notNull(),
    returnTo: text('return_to').notNull().default('/account'),
    pendingEmail: text('pending_email'),
    pendingName: text('pending_name'),
    pendingSubject: text('pending_subject'),
    completedAt: text('completed_at'),
    expiresAt: text('expires_at').notNull(),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [uniqueIndex('idx_google_oauth_state_hash').on(t.stateHash)],
);

export const orderAccessTokens = sqliteTable(
  'order_access_tokens',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: text('expires_at').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    uniqueIndex('idx_order_access_token').on(t.tokenHash),
    index('idx_order_access_order').on(t.orderId),
  ],
);

export const orderSequences = sqliteTable('order_sequences', {
  dateKey: text('date_key').primaryKey(),
  value: integer('value').notNull().default(0),
});

export const abuseLimits = sqliteTable('abuse_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  resetAt: integer('reset_at').notNull(),
},t=>[index('idx_abuse_reset').on(t.resetAt)]);

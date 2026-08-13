const ELIGIBLE_STATUSES = new Set([
  'Perlu Dikirim',
  'Sedang Dikirim',
  'Telah Dikirim',
  'Selesai',
]);

const ESTIMATION_STATUS = Object.freeze({
  ESTIMABLE: 'estimable',
  HPP_INCOMPLETE: 'hpp_incomplete',
  NEEDS_REVIEW: 'needs_review',
  NOT_ELIGIBLE: 'not_eligible',
});

const ADS_PPN_RATE = 0.11;
const STANDARD_SHOPEE_FEE_RATES = Object.freeze({
  administration: 0.0825,
  freeShippingXtra: 0.05,
  promoXtra: 0.045,
  premium: 0.005,
});
const ORDER_PROCESSING_FEE = 1250;

function calculateEstimatedAdsPpn(adsSpend) {
  return Math.round(adsSpend * ADS_PPN_RATE);
}

function normalizeText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text || text === '-' || /^n\/?a$/i.test(text) || /^null$/i.test(text)) return null;
  return text;
}

function parseFiniteNumber(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const number = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isFinite(number) ? number : null;
}

function formatNumberKey(value) {
  const number = parseFiniteNumber(value);
  return number === null ? null : number.toFixed(2);
}

function parseCalendarDate(value) {
  const text = normalizeText(value);
  if (!text) return null;
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/);
  if (!match) return null;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${yearText}-${monthText}-${dayText}`;
}

function validateDateRange(dateFromValue, dateToValue) {
  const dateFrom = dateFromValue === null || dateFromValue === undefined || dateFromValue === ''
    ? null
    : parseCalendarDate(dateFromValue);
  const dateTo = dateToValue === null || dateToValue === undefined || dateToValue === ''
    ? null
    : parseCalendarDate(dateToValue);

  if (dateFromValue && !dateFrom) throw new Error('dateFrom must be a valid YYYY-MM-DD calendar date.');
  if (dateToValue && !dateTo) throw new Error('dateTo must be a valid YYYY-MM-DD calendar date.');
  if (dateFrom && dateTo && dateFrom > dateTo) throw new Error('dateFrom must not be after dateTo.');
  return { dateFrom, dateTo };
}

function isDateInRange(date, { dateFrom, dateTo }) {
  if (!date) return false;
  return (!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo);
}

function addReason(reasons, reason) {
  if (!reasons.includes(reason)) reasons.push(reason);
}

function buildSkuIndex(skuRows = []) {
  const sku1 = new Map();
  const sku2 = new Map();

  const add = (index, aliasValue, priceValue) => {
    const alias = normalizeText(aliasValue);
    const price = parseFiniteNumber(priceValue);
    if (!alias || price === null || price < 0) return;
    const key = alias.toLowerCase();
    const prices = index.get(key) || new Set();
    prices.add(price);
    index.set(key, prices);
  };

  for (const row of skuRows) {
    add(sku1, row.sku1, row.harga);
    add(sku2, row.sku2, row.harga);
  }

  return { sku1, sku2 };
}

function resolveFromAlias(aliasValue, skuIndex) {
  const alias = normalizeText(aliasValue);
  if (!alias) return { kind: 'missing', source: null, alias: null, price: null };
  const key = alias.toLowerCase();
  const sku1Prices = skuIndex.sku1.get(key);
  const sku2Prices = skuIndex.sku2.get(key);
  const prices = new Set([...(sku1Prices || []), ...(sku2Prices || [])]);
  const source = sku1Prices?.size ? 'SKU1' : sku2Prices?.size ? 'SKU2' : null;

  if (!prices.size) return { kind: 'missing', source: null, alias, price: null };
  if (prices.size !== 1) return { kind: 'conflict', source, alias, price: null };
  return { kind: 'resolved', source, alias, price: [...prices][0] };
}

function resolveItemHpp(row, skuIndex) {
  const referenceResult = resolveFromAlias(row.nomor_referensi_sku, skuIndex);
  if (referenceResult.kind === 'resolved' || referenceResult.kind === 'conflict') {
    return { ...referenceResult, matchedBy: 'nomor_referensi_sku' };
  }
  const parentResult = resolveFromAlias(row.sku_induk, skuIndex);
  return { ...parentResult, matchedBy: parentResult.kind === 'missing' ? null : 'sku_induk' };
}

function groupOrderRows(orderRows = []) {
  const groups = new Map();
  let missingOrderSequence = 0;

  for (const row of orderRows) {
    const orderNumber = normalizeText(row.no_pesanan);
    const key = orderNumber || `__MISSING_ORDER_${++missingOrderSequence}`;
    const group = groups.get(key) || { no_pesanan: orderNumber, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function calculateStandardShopeeFees(feeBase) {
  return {
    administration: Math.round(feeBase * STANDARD_SHOPEE_FEE_RATES.administration),
    orderProcessing: ORDER_PROCESSING_FEE,
    freeShippingXtra: Math.round(feeBase * STANDARD_SHOPEE_FEE_RATES.freeShippingXtra),
    promoXtra: Math.round(feeBase * STANDARD_SHOPEE_FEE_RATES.promoXtra),
    premium: Math.round(feeBase * STANDARD_SHOPEE_FEE_RATES.premium),
  };
}

function createOrderResult(group, skuIndex, exceptionOrderNumbers) {
  const rows = group.rows;
  const reasons = [];
  const statusValues = rows.map((row) => normalizeText(row.status_pesanan));
  const statuses = [...new Set(statusValues.filter(Boolean))];
  const hasMissingStatus = statusValues.some((status) => !status);
  const dateValues = rows.map((row) => parseCalendarDate(row.waktu_pesanan_dibuat));
  const dates = [...new Set(dateValues.filter(Boolean))];
  const hasMissingDate = dateValues.some((date) => !date);
  const subtotalValues = rows.map((row) => parseFiniteNumber(row.subtotal_pesanan));
  const hasInvalidSubtotal = subtotalValues.some((subtotal) => subtotal === null || subtotal < 0);
  const voucherValues = rows.map((row) => parseFiniteNumber(row.voucher_ditanggung_penjual));
  const hasInvalidVoucher = voucherValues.some((voucher) => voucher === null || voucher < 0);
  const hasCancelOrReturn = rows.some((row) => normalizeText(row.alasan_pembatalan) || normalizeText(row.status_pembatalan_pengembalian));
  const hasReturnedQuantity = rows.some((row) => {
    const returnedQuantity = parseFiniteNumber(row.returned_quantity);
    return returnedQuantity !== null && returnedQuantity > 0;
  });
  const hasRawException = Boolean(group.no_pesanan && exceptionOrderNumbers.has(group.no_pesanan.toLowerCase()));
  const hasEligibleStatus = statuses.some((status) => ELIGIBLE_STATUSES.has(status));
  const allEligibleStatuses = !hasMissingStatus && statuses.length > 0 && statuses.every((status) => ELIGIBLE_STATUSES.has(status));
  const orderDate = !hasMissingDate && dates.length === 1 ? dates[0] : null;
  const sellerSubtotal = hasInvalidSubtotal ? null : subtotalValues.reduce((total, subtotal) => total + subtotal, 0);
  const sellerVoucher = hasInvalidVoucher ? null : voucherValues.reduce((total, voucher) => total + voucher, 0);
  const feeBase = sellerSubtotal !== null && sellerVoucher !== null ? sellerSubtotal - sellerVoucher : null;

  if (!group.no_pesanan) addReason(reasons, 'NO_PESANAN_TIDAK_VALID');
  if (hasMissingStatus) addReason(reasons, 'STATUS_PESANAN_TIDAK_VALID');
  if (hasMissingDate || dates.length !== 1) addReason(reasons, !hasMissingDate && dates.length > 1 ? 'TANGGAL_PESANAN_TIDAK_KONSISTEN' : 'TANGGAL_PESANAN_TIDAK_VALID');
  if (hasInvalidSubtotal || sellerSubtotal === null) addReason(reasons, 'SUBTOTAL_PESANAN_TIDAK_VALID');
  if (hasInvalidVoucher || sellerVoucher === null || feeBase === null || feeBase < 0) addReason(reasons, 'VOUCHER_PENJUAL_TIDAK_VALID');
  if (statuses.length > 1 && hasEligibleStatus && !allEligibleStatuses) addReason(reasons, 'STATUS_PESANAN_TIDAK_KONSISTEN');

  const itemMappings = [];
  let totalHpp = 0;
  let hppMissing = false;
  let hppConflict = false;
  let quantityInvalid = false;

  for (const row of rows) {
    const quantity = parseFiniteNumber(row.jumlah);
    const mapping = resolveItemHpp(row, skuIndex);
    itemMappings.push({
      nomor_referensi_sku: normalizeText(row.nomor_referensi_sku),
      sku_induk: normalizeText(row.sku_induk),
      nama_variasi: normalizeText(row.nama_variasi),
      quantity,
      hpp: mapping.price,
      hppSource: mapping.source,
      hppMatchedBy: mapping.matchedBy,
      hppStatus: mapping.kind,
    });

    if (!Number.isInteger(quantity) || quantity <= 0) {
      quantityInvalid = true;
      continue;
    }
    if (mapping.kind === 'conflict') {
      hppConflict = true;
      continue;
    }
    if (mapping.kind !== 'resolved' || mapping.price === null) {
      hppMissing = true;
      continue;
    }
    totalHpp += mapping.price * quantity;
  }

  if (quantityInvalid) addReason(reasons, 'QUANTITY_TIDAK_VALID');
  if (hppConflict) addReason(reasons, 'HPP_CONFLICT');
  if (hppMissing) addReason(reasons, 'HPP_TIDAK_DITEMUKAN');

  const hasExplicitIneligibleStatus = statuses.some((status) => !ELIGIBLE_STATUSES.has(status));
  let estimationStatus;
  if (hasCancelOrReturn || hasReturnedQuantity || hasRawException || hasExplicitIneligibleStatus) {
    estimationStatus = ESTIMATION_STATUS.NOT_ELIGIBLE;
    if (hasCancelOrReturn) addReason(reasons, 'CANCELLATION_ATAU_RETURN_MARKER');
    if (hasReturnedQuantity) addReason(reasons, 'RETURNED_QUANTITY_POSITIF');
    if (hasRawException) addReason(reasons, 'CANCELLATION_ATAU_RETURN_RAW');
    if (hasExplicitIneligibleStatus && !hasCancelOrReturn && !hasReturnedQuantity && !hasRawException) addReason(reasons, 'STATUS_TIDAK_ELIGIBLE');
  } else if (reasons.some((reason) => [
    'NO_PESANAN_TIDAK_VALID',
    'TANGGAL_PESANAN_TIDAK_KONSISTEN',
    'TANGGAL_PESANAN_TIDAK_VALID',
    'SUBTOTAL_PESANAN_TIDAK_VALID',
    'VOUCHER_PENJUAL_TIDAK_VALID',
    'STATUS_PESANAN_TIDAK_VALID',
    'STATUS_PESANAN_TIDAK_KONSISTEN',
    'QUANTITY_TIDAK_VALID',
    'HPP_CONFLICT',
  ].includes(reason))) {
    estimationStatus = ESTIMATION_STATUS.NEEDS_REVIEW;
  } else if (hppMissing) {
    estimationStatus = ESTIMATION_STATUS.HPP_INCOMPLETE;
  } else {
    estimationStatus = ESTIMATION_STATUS.ESTIMABLE;
  }

  const standardFees = feeBase === null ? null : calculateStandardShopeeFees(feeBase);
  const estimatedShopeeFees = standardFees ? Object.values(standardFees).reduce((total, fee) => total + fee, 0) : null;
  const estimatedSellerIncome = feeBase !== null && estimatedShopeeFees !== null ? feeBase - estimatedShopeeFees : null;

  return {
    no_pesanan: group.no_pesanan,
    orderDate,
    statusPesanan: statuses.length === 1 ? statuses[0] : statuses.join(' / ') || null,
    itemCount: rows.length,
    sellerSubtotal,
    sellerVoucher,
    feeBase,
    standardFees,
    estimatedShopeeFees,
    estimatedSellerIncome,
    totalHpp: estimationStatus === ESTIMATION_STATUS.ESTIMABLE ? totalHpp : null,
    estimasiKotor: estimationStatus === ESTIMATION_STATUS.ESTIMABLE ? estimatedSellerIncome - totalHpp : null,
    estimationStatus,
    reasons,
    items: itemMappings,
  };
}

function aggregateAdsSpend(adsRows = [], dateRange = { dateFrom: null, dateTo: null }) {
  const byDate = new Map();
  const packagesBySequencedEvent = new Map();
  let total = 0;
  let duplicateEventCount = 0;

  for (const row of adsRows) {
    const date = parseCalendarDate(row.transaction_date);
    const description = normalizeText(row.description);
    const amount = parseFiniteNumber(row.jumlah_signed);
    if (!date || !isDateInRange(date, dateRange) || !description || amount === null || amount >= 0) continue;
    if (!/^Deduction for Product Ad\b/i.test(description)) continue;

    const sequence = normalizeText(row.sequence_number);
    const packageId = normalizeText(row.ads_report_import_id);
    if (sequence && packageId) {
      const fingerprint = [date, sequence, description.toLowerCase(), formatNumberKey(amount), normalizeText(row.note) || ''].join('\u001f');
      const sourcePackages = packagesBySequencedEvent.get(fingerprint) || new Set();
      if (sourcePackages.size > 0 && !sourcePackages.has(packageId)) {
        sourcePackages.add(packageId);
        packagesBySequencedEvent.set(fingerprint, sourcePackages);
        duplicateEventCount += 1;
        continue;
      }
      sourcePackages.add(packageId);
      packagesBySequencedEvent.set(fingerprint, sourcePackages);
    }

    const spend = Math.abs(amount);
    total += spend;
    byDate.set(date, (byDate.get(date) || 0) + spend);
  }

  return { total, byDate, duplicateEventCount };
}

function sortOrdersDescending(left, right) {
  const dateComparison = String(right.orderDate || '').localeCompare(String(left.orderDate || ''));
  if (dateComparison) return dateComparison;
  return String(right.no_pesanan || '').localeCompare(String(left.no_pesanan || ''));
}

function buildEstimationReport({
  orderRows = [],
  skuRows = [],
  adsRows = [],
  exceptionOrderNumbers = [],
  dateFrom = null,
  dateTo = null,
  page = 1,
  limit = 50,
} = {}) {
  const dateRange = validateDateRange(dateFrom, dateTo);
  const skuIndex = buildSkuIndex(skuRows);
  const rawExceptionOrders = new Set(
    exceptionOrderNumbers.map((orderNumber) => normalizeText(orderNumber)).filter(Boolean).map((orderNumber) => orderNumber.toLowerCase()),
  );
  const allOrders = groupOrderRows(orderRows)
    .map((group) => createOrderResult(group, skuIndex, rawExceptionOrders))
    .filter((order) => !order.orderDate || isDateInRange(order.orderDate, dateRange))
    .sort(sortOrdersDescending);
  const ads = aggregateAdsSpend(adsRows, dateRange);

  const summary = {
    totalOrderCount: allOrders.length,
    eligibleOrderCount: allOrders.filter((order) => order.estimationStatus !== ESTIMATION_STATUS.NOT_ELIGIBLE).length,
    estimatedOrderCount: allOrders.filter((order) => order.estimationStatus === ESTIMATION_STATUS.ESTIMABLE).length,
    hppIncompleteOrderCount: allOrders.filter((order) => order.estimationStatus === ESTIMATION_STATUS.HPP_INCOMPLETE).length,
    reviewOrderCount: allOrders.filter((order) => order.estimationStatus === ESTIMATION_STATUS.NEEDS_REVIEW).length,
    excludedOrderCount: allOrders.filter((order) => order.estimationStatus === ESTIMATION_STATUS.NOT_ELIGIBLE).length,
    estimatedGrossBeforeFeeAds: allOrders.reduce((total, order) => total + (order.estimasiKotor || 0), 0),
    adsSpend: ads.total,
    adsPpnRate: ADS_PPN_RATE,
    estimatedAdsPpn: 0,
    afterAds: 0,
    afterAdsAndPpn: 0,
    adsDuplicateEventCount: ads.duplicateEventCount,
  };
  summary.afterAds = summary.estimatedGrossBeforeFeeAds - summary.adsSpend;

  const dailyMap = new Map();
  const dailyEntry = (date) => {
    const existing = dailyMap.get(date);
    if (existing) return existing;
    const next = {
      date,
      estimatedOrderCount: 0,
      hppIncompleteOrderCount: 0,
      reviewOrderCount: 0,
      estimatedGrossBeforeFeeAds: 0,
      adsSpend: 0,
      estimatedAdsPpn: 0,
      afterAds: 0,
      afterAdsAndPpn: 0,
    };
    dailyMap.set(date, next);
    return next;
  };

  for (const order of allOrders) {
    if (!order.orderDate) continue;
    const entry = dailyEntry(order.orderDate);
    if (order.estimationStatus === ESTIMATION_STATUS.ESTIMABLE) {
      entry.estimatedOrderCount += 1;
      entry.estimatedGrossBeforeFeeAds += order.estimasiKotor || 0;
    } else if (order.estimationStatus === ESTIMATION_STATUS.HPP_INCOMPLETE) {
      entry.hppIncompleteOrderCount += 1;
    } else if (order.estimationStatus === ESTIMATION_STATUS.NEEDS_REVIEW) {
      entry.reviewOrderCount += 1;
    }
  }
  for (const [date, spend] of ads.byDate.entries()) dailyEntry(date).adsSpend += spend;
  const daily = [...dailyMap.values()]
    .map((entry) => {
      const estimatedAdsPpn = calculateEstimatedAdsPpn(entry.adsSpend);
      const afterAds = entry.estimatedGrossBeforeFeeAds - entry.adsSpend;
      return { ...entry, estimatedAdsPpn, afterAds, afterAdsAndPpn: afterAds - estimatedAdsPpn };
    })
    .sort((left, right) => right.date.localeCompare(left.date));

  summary.estimatedAdsPpn = daily.reduce((total, entry) => total + entry.estimatedAdsPpn, 0);
  summary.afterAdsAndPpn = summary.afterAds - summary.estimatedAdsPpn;

  const safePage = Number.isSafeInteger(Number(page)) && Number(page) > 0 ? Number(page) : 1;
  const safeLimit = Number.isSafeInteger(Number(limit)) && Number(limit) > 0 ? Number(limit) : 50;
  const offset = (safePage - 1) * safeLimit;

  return {
    dateRange,
    summary,
    daily,
    orders: { total: allOrders.length, page: safePage, limit: safeLimit, data: allOrders.slice(offset, offset + safeLimit) },
  };
}

module.exports = {
  ADS_PPN_RATE,
  ORDER_PROCESSING_FEE,
  STANDARD_SHOPEE_FEE_RATES,
  ELIGIBLE_STATUSES,
  ESTIMATION_STATUS,
  aggregateAdsSpend,
  buildEstimationReport,
  buildSkuIndex,
  calculateStandardShopeeFees,
  parseCalendarDate,
  resolveItemHpp,
  validateDateRange,
};
module.exports.default = module.exports;

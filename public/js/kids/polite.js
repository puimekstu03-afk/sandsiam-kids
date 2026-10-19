'use strict';

/**
 * SANDSIAM · Polite: a simple filter for rude words in nicknames and blessings.
 * The database checks the same lists again (private.is_polite in
 * supabase/migrations/20261019060000_safer_field.sql): change both together.
 */
const Polite = (() => {
  // A short starter list of rude words in Thai and English; teachers can extend it.
  const WORDS = [
    'ควย', 'เหี้ย', 'สัส', 'สัด', 'เย็ด', 'หี', 'แม่ง', 'มึง', 'กู', 'ไอ้สัตว์', 'อีดอก', 'ระยำ', 'ชาติชั่ว', 'ส้นตีน', 'ตอแหล', 'ห่า', 'จัญไร', 'ดอกทอง', 'โง่', 'ควาย',
    'fuck', 'shit', 'bitch', 'bastard', 'pussy', 'asshole', 'stupid', 'idiot',
  ];
  // Everyday words that only contain a rude one (ห่างไกล, สกู๊ตเตอร์, แม่งาน, ดอกทองกวาว …): taken out first.
  const FINE = [
    'ห่าง', 'ห่าน', 'ห่าม', 'หีบ', 'สัดส่วน', 'สัดว์', 'กู้', 'กูเกิล', 'กูรู', 'กูด', 'สกู๊ต', 'สกู',
    'แม่งาม', 'แม่งาน', 'ทองกวาว', 'ทองอุไร', 'ทองหลาง',
  ];
  // Short English words count only as whole words, so Sussex or Dickens are fine.
  const WHOLE = /\b(dick|damn|sex)\b/;
  const squash = (text) => text.toLowerCase().replace(/[\s._\-*!@#$%^&()​‌‍﻿]+/g, '');
  return {
    /** True when the text looks free of rude words. */
    ok(text) {
      const raw = (text || '').toLowerCase();
      if (WHOLE.test(raw)) return false;
      const plain = FINE.reduce((t, w) => t.split(w).join(''), squash(raw));
      return !WORDS.some((w) => plain.includes(w));
    },
  };
})();

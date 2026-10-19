'use strict';

/** SANDSIAM · Polite: a simple filter for rude words in nicknames and blessings. */
const Polite = (() => {
  // A short starter list of rude words in Thai and English; teachers can extend it.
  const WORDS = [
    'ควย', 'เหี้ย', 'สัส', 'สัด', 'เย็ด', 'หี', 'แม่ง', 'มึง', 'กู', 'ไอ้สัตว์', 'อีดอก', 'ระยำ', 'ชาติชั่ว', 'ส้นตีน', 'ตอแหล', 'ห่า', 'จัญไร', 'ดอกทอง', 'โง่', 'ควาย',
    'fuck', 'shit', 'bitch', 'bastard', 'damn', 'dick', 'pussy', 'asshole', 'stupid', 'idiot', 'sex',
  ];
  const squash = (text) => text.toLowerCase().replace(/[\s._\-*!@#$%^&()]+/g, '');
  return {
    /** True when the text looks free of rude words. */
    ok(text) {
      const plain = squash(text || '');
      return !WORDS.some((w) => plain.includes(squash(w)));
    },
  };
})();

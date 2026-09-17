const field = (id, value) => {
  const data = String(value);
  if (data.length > 99) throw new Error("Campo Pix longo demais.");
  return `${id}${String(data.length).padStart(2, "0")}${data}`;
};

function crc16(value) {
  let crc = 0xffff;
  for (const byte of Buffer.from(value, "ascii")) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++)
      crc = ((crc << 1) ^ (crc & 0x8000 ? 0x1021 : 0)) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

const ascii = (value, max) => String(value)
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^A-Za-z0-9 .-]/g, "")
  .trim()
  .slice(0, max);

export function createPixPayload({ key, amountCents = null, txid = "***", merchantName = "STREET DOCES", city = "BETIM" }) {
  if (!key || key.length > 77 || !(
    /^\S+@\S+\.\S+$/.test(key) ||
    /^\+55\d{10,11}$/.test(key) ||
    /^\d{11,14}$/.test(key) ||
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(key)
  ))
    throw new Error("Chave Pix inválida.");
  if (amountCents !== null && (!Number.isSafeInteger(amountCents) || amountCents < 1 || amountCents > 999999999))
    throw new Error("Valor Pix inválido.");
  if (txid !== "***" && !/^[A-Za-z0-9]{1,25}$/.test(txid))
    throw new Error("Identificador Pix inválido.");
  const name = ascii(merchantName, 25);
  const merchantCity = ascii(city, 15);
  if (!name || !merchantCity) throw new Error("Dados do recebedor inválidos.");
  const merchant = field("00", "br.gov.bcb.pix") + field("01", key);
  const withoutCrc =
    field("00", "01") + field("26", merchant) + field("52", "0000") +
    field("53", "986") +
    (amountCents === null ? "" : field("54", (amountCents / 100).toFixed(2))) +
    field("58", "BR") + field("59", name) + field("60", merchantCity) +
    field("62", field("05", txid)) + "6304";
  return withoutCrc + crc16(withoutCrc);
}

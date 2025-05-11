const parseReminder = (message) => {
  const regex = /me lembre de (.+) (no|em|na|nesse|neste)? (.+) às? (\d{1,2})[:h]?(\d{0,2})?/i;
  const match = message.match(regex);
  if (match) {
    const texto = match[1].trim();
    const dia = match[3].trim();
    const hora = parseInt(match[4]);
    const minuto = match[5] ? parseInt(match[5]) : 0;
    return { texto, dia, hora, minuto };
  }
  return null;
};


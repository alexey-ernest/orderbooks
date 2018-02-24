const book = require('./exchanges/zaif');
const beep = require('beeper');

book
  .on('update', (book, market, ticker) => {
    console.log(market, ticker);
    console.log(book[market][ticker]);
  })
  .on('error', err => {
    if (err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND' || err.code === 'ECONNRESET') {
      return;
    }

    console.log(err);
    beep(1);
  })
  .listen();

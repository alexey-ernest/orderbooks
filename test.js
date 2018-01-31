
// const book = require('./exchanges/hitbtc');
// const book = require('./exchanges/kraken');
const book = require('./exchanges/bitstamp');
const beep = require('beeper');

book
  .on('update', (book, market, ticker) => {
    // if (ticker === 'PPT') {
    //   console.log(book[market][ticker].asks[0], book[market][ticker].bids[0]);
    // }
    console.log(market, ticker);
    if (market === 'ETH' && ticker === 'DAT') {
      console.log(book[market][ticker]);
    }
  })
  .on('error', err => {
    if (err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND' || err.code === 'ECONNRESET') {
      return;
    }

    console.log(err);
    beep(1);
  })
  .listen();

const fs = require('fs');
const path = require('path');

const results = [];

async function crawlProductList(browser, page) {
  const products = await page.evaluate(() => {
    const items = document.querySelectorAll('.gl-item');
    const products = [];
    
    items.forEach((item, index) => {
      const titleEl = item.querySelector('.p-name a');
      const priceEl = item.querySelector('.p-price');
      const shopEl = item.querySelector('.p-shop a');
      const salesEl = item.querySelector('.p-commit');
      const linkEl = item.querySelector('.p-name a');
      
      products.push({
        index: index,
        title: titleEl?.textContent?.trim() || '',
        price: priceEl?.textContent?.trim() || '',
        shop: shopEl?.textContent?.trim() || '',
        sales: salesEl?.textContent?.trim() || '',
        link: linkEl?.href || ''
      });
    });
    
    return products;
  });
  
  return products;
}

async function crawlProductDetail(browser, page, productLink) {
  await page.goto(productLink, { waitUntil: 'networkidle2', timeout: 30000 });
  
  await page.waitForTimeout(2000);
  
  const detail = await page.evaluate(() => {
    const reviews = {};
    
    const commentsEl = document.querySelector('.comments-list');
    if (commentsEl) {
      const goodEl = document.querySelector('.filter-items a[data-tab="good"]');
      const neutralEl = document.querySelector('.filter-items a[data-tab="neutral"]');
      const badEl = document.querySelector('.filter-items a[data-tab="bad"]');
      
      reviews.good = goodEl?.textContent?.trim() || '';
      reviews.neutral = neutralEl?.textContent?.trim() || '';
      reviews.bad = badEl?.textContent?.trim() || '';
    }
    
    const regionEl = document.querySelector('.address-item');
    const region = regionEl?.textContent?.trim() || '';
    
    return { reviews, region };
  });
  
  return detail;
}

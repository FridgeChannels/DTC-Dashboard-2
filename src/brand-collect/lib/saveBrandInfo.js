import { updateBrandInfoMagnetBrandParams } from './magnetBrandParam.js';
import { saveProduct } from './products.js';

export async function saveBrandInfo(input) {
  const {
    brandName,
    brandWebsite,
    brandLogo,
    productName,
    productPrice,
    productImage,
    colors = {},
  } = input;

  const magnetBrandParam = await updateBrandInfoMagnetBrandParams({
    brandName,
    website: brandWebsite,
    brandLogo,
    primaryColor: colors.primary,
    secondaryColor: colors.secondary || colors.accent,
    customerId: input.customerId,
  });

  let productRecord = null;
  if (productName?.trim()) {
    productRecord = await saveProduct({
      name: productName,
      price: productPrice,
      imageUrl: productImage,
      brandName,
    });
  }

  const storedLogo = magnetBrandParam.records?.[0]?.brandLogo ?? null;

  return {
    brandName: brandName?.trim() || '',
    brandWebsite: brandWebsite?.trim() || '',
    brandLogo: storedLogo,
    colors: {
      primary: colors.primary || '',
      secondary: colors.secondary || '',
      accent: colors.accent || '',
    },
    productName: productName?.trim() || '',
    productPrice: productPrice?.trim() || '',
    productImage: productRecord?.imageUrl || productImage?.trim() || '',
    magnetBrandParam,
    productRecord,
  };
}

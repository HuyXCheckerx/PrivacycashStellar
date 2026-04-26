import { NextResponse } from "next/server";
import { generateMetaKey, deriveStealthAddress, checkStealthAddress } from "@/lib/crypto";

export async function GET() {
  try {
    const bobKey = generateMetaKey();
    const aliceMath = deriveStealthAddress(bobKey.publicKeyHex);
    const bobMath = checkStealthAddress(aliceMath.ephemeralPubHex, aliceMath.encryptedSeedHex, bobKey.privateKeyHex);
    
    return NextResponse.json({
      success: true,
      bobPublicKey: bobKey.publicKeyHex,
      bobPrivateKey: bobKey.privateKeyHex,
      aliceStealthAddress: aliceMath.stealthAddress,
      bobStealthAddress: bobMath?.stealthAddress,
      match: aliceMath.stealthAddress === bobMath?.stealthAddress,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message });
  }
}

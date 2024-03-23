import { Address, Hex, PublicClient, isAddressEqual, verifyMessage, zeroHash } from 'viem';

import { getDelegateXyzContract } from '../contracts/DelegateXyz';

export const verifySignatureWithDelegation = async ({
  walletAddress,
  signerAddress,
  message,
  signature,
  web3Client,
  delegateXyzRights = zeroHash,
}: {
  walletAddress: Address;
  signerAddress: Address;
  message: string;
  signature: Hex;
  web3Client: PublicClient;
  delegateXyzRights?: Hex;
}): Promise<Address | null> => {
  const signatureVerificationParams = {
    address: signerAddress,
    message,
    signature,
  };

  if (
    !((await verifyMessage(signatureVerificationParams)) || (await web3Client.verifyMessage(signatureVerificationParams)))
  ) {
    return null;
  }

  // Verify delegate
  const isNotAuthorized =
    !isAddressEqual(walletAddress, signerAddress) &&
    !(await getDelegateXyzContract(web3Client).read.checkDelegateForAll([signerAddress, walletAddress, delegateXyzRights]));

  if (isNotAuthorized) {
    return null;
  }

  return walletAddress;
};

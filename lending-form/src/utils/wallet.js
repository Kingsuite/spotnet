import { connect } from 'get-starknet';
import { cairo, uint256 } from 'starknet';

export async function connectWallet() {
  try {
    const starknet = await connect({
      modalMode: 'alwaysAsk',
      modalTheme: 'light',
    });

    if (!starknet) {
      throw new Error("Failed to connect to wallet");
    }

    await starknet.enable();

    if (starknet.isConnected) {
      const address = starknet.selectedAddress;
      console.log("Wallet connected. Address:", address);
      return address;
    } else {
      throw new Error("Wallet connection failed");
    }
  } catch (error) {
    console.error("Error connecting wallet:", error);
    if (error.message.includes("User rejected wallet selection")) {
      throw new Error("Wallet connection cancelled by user");
    }
    throw new Error("Failed to connect to wallet. Please make sure Argent X is installed and try again.");
  }
}


export async function sendTransaction(transactionData) {
  try {
    const starknet = await connect();
    if (!starknet.isConnected) {
      throw new Error("Wallet not connected");
    }

    // Extract approve_data and loop_liquidity_data from transactionData
    const approveData = transactionData.approve_data;
    const loopLiquidityData = transactionData.loop_liquidity_data;

    // Ensure all required fields are present and of the correct type
    if (!approveData.to_address || !approveData.spender || !approveData.amount) {
      throw new Error("Missing or invalid approve_data fields");
    }

    if (!loopLiquidityData.pool_key || !loopLiquidityData.deposit_data) {
      throw new Error("Missing or invalid loop_liquidity_data fields");
    }

    // Helper function to convert numbers to Cairo-compatible format
    const toCairoNumber = (num) => {
      return cairo.uint256(num).toString();
    };

    // Construct approve transaction
    const approveTransaction = {
      contractAddress: approveData.to_address,
      entrypoint: "approve",
      calldata: [
        approveData.spender,
        uint256.bnToUint256(toCairoNumber(approveData.amount)).low,
        uint256.bnToUint256(toCairoNumber(approveData.amount)).high
      ]
    };

    // Send approve transaction
    const approveResponse = await starknet.account.execute(approveTransaction);
    console.log("Approve transaction response:", approveResponse);

    // Wait for approve transaction to be accepted
    await starknet.provider.waitForTransaction(approveResponse.transaction_hash);

    // Construct deposit transaction
    const depositTransaction = {
      contractAddress: loopLiquidityData.pool_key.token0,
      entrypoint: "deposit",
      calldata: [
        loopLiquidityData.pool_key.token0,
        loopLiquidityData.pool_key.token1,
        uint256.bnToUint256(toCairoNumber(loopLiquidityData.deposit_data.amount)).low,
        uint256.bnToUint256(toCairoNumber(loopLiquidityData.deposit_data.amount)).high,
        toCairoNumber(loopLiquidityData.deposit_data.multiplier)
      ]
    };

    // Send deposit transaction
    const depositResponse = await starknet.account.execute(depositTransaction);
    console.log("Deposit transaction response:", depositResponse);

    // Wait for deposit transaction to be accepted
    await starknet.provider.waitForTransaction(depositResponse.transaction_hash);

    return {
      approveHash: approveResponse.transaction_hash,
      depositHash: depositResponse.transaction_hash
    };
  } catch (error) {
    console.error("Error sending transaction:", error);
    throw error;
  }
}

async function waitForTransaction(txHash) {
  const starknet = await connect();
  let receipt = null;
  while (receipt === null) {
    try {
      receipt = await starknet.provider.getTransactionReceipt(txHash);
    } catch (error) {
      console.log("Waiting for transaction to be accepted...");
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for 5 seconds before trying again
    }
  }
  console.log("Transaction accepted:", receipt);
}

export function logout() {
  // Clear local storage
  localStorage.removeItem('wallet_id');
}

export async function getTokenBalances(walletAddress) {
  try {
    const starknet = await connect();
    if (!starknet.isConnected) {
      throw new Error("Wallet not connected");
    }

    const tokenBalances = {
      ETH: await getTokenBalance(starknet, walletAddress, '0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7'),
      USDC: await getTokenBalance(starknet, walletAddress, '0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8'),
      STRK: await getTokenBalance(starknet, walletAddress, '0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d')
    };

    return tokenBalances;
  } catch (error) {
    console.error("Error fetching token balances:", error);
    throw error;
  }
}

async function getTokenBalance(starknet, walletAddress, tokenAddress) {
  try {
    const response = await starknet.provider.callContract({
      contractAddress: tokenAddress,
      entrypoint: 'balanceOf',
      calldata: [walletAddress]
    });

    // Convert the balance to a human-readable format
    // Note: This assumes the balance is returned as a single uint256
    // You may need to adjust this based on the actual return value of your contract
    const balance = BigInt(response.result[0]).toString();

    // Convert to a more readable format (e.g., whole tokens instead of wei)
    // This example assumes 18 decimal places, adjust as needed for each token
    const readableBalance = (Number(balance) / 1e18).toFixed(4);

    return readableBalance;
  } catch (error) {
    console.error(`Error fetching balance for token ${tokenAddress}:`, error);
    return '0'; // Return '0' in case of error
  }
}

// Add this line at the top of your file if you're using Create React App or a similar setup
// that doesn't recognize BigInt as a global
const BigInt = window.BigInt;
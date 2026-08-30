require("dotenv").config();
const express = require("express");
const { MongoClient, ObjectId } = require("mongodb")
const axios = require ("axios");
const cors = require('cors')
const app = express();
const PORT = process.env.PORT || 3000;
const bcrypt = require("bcrypt")


const uri = process.env.MONGO_URI;

app.use(cors())
app.use(express.json());


const client = new MongoClient(uri);

let db;

async function connectToMongo() {
  try {
    await client.connect();
    console.log("Successfully connected to MongoDB");
    db = client.db("GenCore"); 
  } catch (error) {
    console.log("MongoDB Connection Error:", error);
  }
}

async function basicAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Basic ")) {
        return res
            .status(401)
            .json({ message: "Authentication header missing or invalid" });
    }

    try {
        const base64Token = authHeader.split(" ")[1];
        if (!base64Token) {
            return res.status(401).json({ message: "Malformed auth header" });
        }

        const decodedString = Buffer.from(base64Token, "base64").toString("ascii");
        
        const credentials = decodedString.split(":");
        const email = credentials[0];
        const password = credentials[1];

        const user = await db.collection("Users").findOne({ userEmail: email });

        if (!user) {
            return res.status(401).json({ message: "User not found" });
        }

        const isMatch = await bcrypt.compare(password, user.userPassword);

        if (!isMatch) {
            return res.status(401).json({ message: "Invalid password" });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error("Auth Middleware Error:", error);
        return res.status(500).json({ message: "Internal server error during auth" });
    }
}


//USER AUTHENTICATION

app.post("/usersession", async (req, res) => {
    //to create an object for when an existing user logs in
    const {userEmail, userPassword} = req.body;

    try {
        const database = client.db("GenCore");
        const usersCollection = database.collection("Users");

        const existingUser = await usersCollection.findOne({ userEmail : userEmail });
        const isMatch = existingUser ? await bcrypt.compare(userPassword, existingUser.userPassword) : false;
        if(!existingUser || !isMatch){
            return res.status(401).json({ message: "Invalid email or password."});
        };

        res.status(200).json({
            message: "Login successful!",
            user: {

                id: existingUser._id,
                username: existingUser.userUsername,
                email: existingUser.userEmail

            }
        });

    } catch(error) {
        console.error("Error during login:", error);
        res.status(500).json({ message: "Internal server error occurred." });
    }

});

app.post("/userinformation", async (req, res) => {
    //to create an object for new user information
    const {userEmail, userFirstName, userSurname, userUsername, userPassword} = req.body;

    try {
        const database = client.db("GenCore");
        const usersCollection = database.collection("Users");

        const existingUser = await usersCollection.findOne({ userEmail : userEmail });
        if(existingUser){
            return res.status(400).json({ message: "Email already registered!"});
        };

        const newUser = {
            userEmail,
            userFirstName,
            userSurname,
            userUsername,
            userPassword
        }

        const hashedPassword = await bcrypt.hash(newUser.userPassword,10);
        newUser.userPassword= hashedPassword;

        const result = await usersCollection.insertOne(newUser);

        res.status(201).json({ message: "User registered successfully!", userId: result.insertedId });
    } catch(error) {
        console.error("Error creating user:", error);
        res.status(500).json({ message: "Internal server error occurred." });
    }
});


app.get("/userinformation", basicAuth, async (req, res) => {
    //to read user information in the form of a string separated by line breaks
    const { userEmail } = req.query;

    try {
        const database = client.db("GenCore");
        const usersCollection = database.collection("Users");

        const user = await usersCollection.findOne({ userEmail: userEmail });

        if (!user) {
            return res.status(404).send("User not found.");
        }

        const textResponse = `Username: ${user.userUsername}\n` +`First Name: ${user.userFirstName}\n` + `Surname: ${user.userSurname}\n` + `Email: ${user.userEmail}`;

        res.status(200).type("text/plain").send(textResponse);

    } catch (error) {
        console.error("Error reading user:", error);
        res.status(500).send("Internal server error.");
    }

});

app.put("/userinformation", basicAuth, async (req, res) => {
    //to update existing user information
    const { userEmail, userFirstName, userSurname, userUsername } = req.body;

    try {
        const database = client.db("GenCore");
        const usersCollection = database.collection("Users");

        const result = await usersCollection.updateOne(
            { userEmail: userEmail },
            { $set: { userEmail, userFirstName, userSurname, userUsername } }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: "User not found." });
        }

        res.status(200).json({ message: "User information updated successfully!" });

    } catch (error) {
        console.error("Error updating user:", error);
        res.status(500).json({ message: "Internal server error." });
    }

});

app.delete("/userinformation", basicAuth, async (req, res) => {
    //to delete user information
    
    const { userEmail } = req.body;

    try {
        const database = client.db("GenCore");
        const usersCollection = database.collection("Users");

        const result = await usersCollection.deleteOne({ userEmail: userEmail });

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: "User not found." });
        }

        res.status(200).json({ message: "User deleted from existence successfully." });

    } catch (error) {
        console.error("Error deleting user:", error);
        res.status(500).json({ message: "Internal server error." });
    }

});


//PRODUCT CATALOG AND SEARCH

app.post("/productinfo", basicAuth, async (req, res) => {
    //For staff to add new laptop products to the online store

    const { deviceType, deviceName, deviceSpecs, devicePrice } = req.body;

    try {
        const database = client.db("GenCore");
        const productsCollection = database.collection("Products");

        const newProduct = { deviceType, deviceName, deviceSpecs, devicePrice };
        const result = await productsCollection.insertOne(newProduct);
                   
        res.status(201).json({ 
            message: "Product added successfully!", 
            productId: result.insertedId 
        });
    } catch (error) {
        console.error("Error adding product:", error);
        res.status(500).json({ message: "Internal server error." });
    }


});

app.get('/productinfo', async (req, res) => {
    try {
        const { deviceName, search, minPrice, maxPrice, ram } = req.query;
        let query = {};

        
        const searchTerm = search || deviceName;
        if (searchTerm) {
            const regex = new RegExp(searchTerm, 'i'); 
            query.$or = [
                { deviceName: regex },
                { deviceSpecs: regex },
                { deviceType: regex },
                { deviceRam: regex },
                { deviceStorage: regex }
            ];
        }

        if (ram) {
            query.deviceRam = new RegExp(ram, 'i');
        }

        if (minPrice || maxPrice) {
            query.devicePrice = {};
            if (minPrice) query.devicePrice.$gte = Number(minPrice);
            if (maxPrice) query.devicePrice.$lte = Number(maxPrice);
        }

        const products = await db.collection('Products').find(query).toArray();

        if (!products || products.length === 0) {
            return res.status(404).json({ message: "No matching devices found." });
        }

        res.status(200).json(products);
    } catch (err) {
        console.error("Error querying products:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.get("/productinfo/:id", async (req, res) => {
    //For a specific item to be retrieved

    const { id } = req.params; 

    try {
        const database = client.db("GenCore");
        const productsCollection = database.collection("Products");

        const product = await productsCollection.findOne({ _id: new ObjectId(id) });

        if (!product) {
            return res.status(404).json({ message: "Product not found." });
        }

        res.status(200).json(product);
    } catch (error) {
        console.error("Error fetching product:", error);
        res.status(500).json({ message: "Invalid ID or server error." });
    }
});



app.put("/productinfo/:id", basicAuth, async (req, res) => {
    //For a specific product to be updated

    const { id } = req.params;
    const updateData = req.body; 

    try {
        const database = client.db("GenCore");
        const productsCollection = database.collection("Products");

        const result = await productsCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: updateData } 
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: "Product not found." });
        }

        res.status(200).json({ message: "Product updated successfully!" });
    } catch (error) {
        console.error("Error updating product:", error);
        res.status(500).json({ message: "Internal server error." });
    }
});


app.delete("/productinfo/:id", basicAuth, async (req, res) => {
    //To delete a specific product

    const { id } = req.params;

    try {
        const database = client.db("GenCore");
        const productsCollection = database.collection("Products");

        const result = await productsCollection.deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: "Product not found." });
        }

        res.status(200).json({ message: "Product deleted successfully." });
    } catch (error) {
        console.error("Error deleting product:", error);
        res.status(500).json({ message: "Internal server error." });
    }
});


//CART AND ORDER PROCESSING 

// To add an item to cart
app.post("/addcart", async (req, res) => {
    const { deviceName, devicePrice, itemsCount, itemsTotalPrice, itemConfirmed } = req.body;

    try {
        const database = client.db("GenCore");
        const cartCollection = database.collection("Cart");

        const newCartItem = {
            deviceName,
            devicePrice,
            itemsCount: parseInt(itemsCount) || 1,
            itemsTotalPrice,
            itemConfirmed: itemConfirmed === undefined ? false : Boolean(itemConfirmed)
        };

        const result = await cartCollection.insertOne(newCartItem);
        res.status(201).json({ 
            message: "Item successfully added to cart!", 
            cartItemId: result.insertedId 
        });
    } catch (error) {
        console.error("Error in POST /addcart:", error);
        res.status(500).json({ message: "Internal server error." });
    }
});

// To delete a specific item from the cart
app.delete("/addcart/:id", async (req, res) => {
    const { id } = req.params;

    try {
        const database = client.db("GenCore");
        const cartCollection = database.collection("Cart");

        const result = await cartCollection.deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: "Cart item not found." });
        }

        res.status(200).json({ message: "Item successfully deleted from cart." });
    } catch (error) {
        console.error("Error in DELETE /addcart:", error);
        res.status(500).json({ message: "Invalid IDor internal server error." });
    }
});

// To confirm cart items and prices
app.post("/confirmcart", basicAuth, async (req, res) => {
    const { paymentType, cardNumber, cardName, cardExp, cardCvc, paymentGate, detailsValid, itemPaid } = req.body;

    try {
        const database = client.db("GenCore");
        const paymentInfoCollection = database.collection("PaymentInfo");

        const newPaymentRecord = {
            paymentType,
            cardNumber,
            cardName,
            cardExp,
            cardCvc,
            paymentGate,
            detailsValid: detailsValid === undefined ? true : Boolean(detailsValid),
            itemPaid: itemPaid === undefined ? true : Boolean(itemPaid)
        };

        const result = await paymentInfoCollection.insertOne(newPaymentRecord);
        res.status(201).json({ 
            message: "Cart items saved.", 
            paymentId: result.insertedId 
        });
    } catch (error) {
        console.error("Error in POST /confirmcart:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// To retrieve specific payment confirmation details
app.get("/paymentconfirm/:id", basicAuth, async (req, res) => {
    const { id } = req.params;

    try {
        const database = client.db("GenCore");
        const paymentInfoCollection = database.collection("PaymentInfo");

        const paymentDetails = await paymentInfoCollection.findOne({ _id: new ObjectId(id) });
                        //Did you look at line 750 yet?
        if (!paymentDetails) {
            return res.status(404).json({ message: "Payment confirmation record not found." });
        }

        res.status(200).json(paymentDetails);
    } catch (error) {
        console.error("Error in GET /paymentconfirm:", error);
        res.status(500).json({ message: "Invalid ID or internal server error." });
    }
});


app.post('/ordernumber', async (req, res) => {
    try {
        const { userEmail } = req.body;
        

        const customOrderId = "ORD-" + Math.floor(100000 + Math.random() * 900000);

        const newOrder = {
            orderId: customOrderId,
            userEmail: userEmail,
            createdAt: new Date(),
            currentStatus: "Order Placed & Processing"
        };

        await db.collection('Orders').insertOne(newOrder);

        res.status(200).json({ orderNumber: customOrderId, message: "Order created successfully!" });
    } catch (err) {
        console.error("Error creating order:", err);
        res.status(500).json({ error: "Failed to generate order" });
    }
});

app.get("/ordernumber/:id", async (req, res) => {
    const { id } = req.params;

    try {
        const database = client.db("GenCore");
        const ordersCollection = database.collection("Orders");

        const orderDetails = await ordersCollection.findOne({ _id: new ObjectId(id) });

        if (!orderDetails) {
            return res.status(404).json({ message: "Specific order record not found." });
        }

        res.status(200).json(orderDetails);
    } catch (error) {
        console.error("Error in GET /ordernumber:", error);
        res.status(500).json({ message: "Invalid ID format or internal server error." });
    }
});

app.get('/orders', async (req, res) => {
    try {
        const database = client.db("GenCore");
        const ordersCollection = database.collection("Orders");

        const orders = await ordersCollection.find({}).toArray();
        res.status(200).json(orders);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch orders" });
    }
});



//DELIVERY PROCESSING

app.get("/deliveryinfo/:id", async (req, res) => {
    // To get information for a specific delivery by its ID

    const { id } = req.params;

    try {
        const database = client.db("GenCore");
        const deliveryCollection = database.collection("Delivery");

        const delivery = await deliveryCollection.findOne({ _id: new ObjectId(id) });

        if (!delivery) {
            return res.status(404).json({ message: "Delivery record not found." });
        }

        res.status(200).json(delivery);
    } catch (error) {
        console.error("Error in GET /deliveryinfo:", error);
        res.status(500).json({ message: "Invalid ID format or server error." });
    }
});

app.delete("/deliveryinfo/:id", basicAuth, async (req, res) => {
    // To delete a specific delivery record by its ID
    const { id } = req.params;

    try {
        const database = client.db("GenCore");
        const deliveryCollection = database.collection("Delivery");

        const result = await deliveryCollection.deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: "Delivery record not found." });
        }

        res.status(200).json({ message: "Delivery record successfully deleted." });
    } catch (error) {
        console.error("Error in DELETE /deliveryinfo:", error);
        res.status(500).json({ message: "Invalid ID format or server error." });
    }
});


app.get("/deliverystatus/:id", async (req, res) => {
    //To get the status of a specific delivery by its ID
    const { id } = req.params;

    try {
        const database = client.db("GenCore");
        const deliveryCollection = database.collection("Delivery");

        const delivery = await deliveryCollection.findOne(
            { _id: new ObjectId(id) },
            { projection: { orderNumber: 1, statusDate: 1, statusTime: 1, statusMessage: 1 } }
        );

        if (!delivery) {
            return res.status(404).json({ message: "Delivery record not found." });
        }

        res.status(200).json({
            orderNumber: delivery.orderNumber,
            currentStatus: `${delivery.statusMessage} (As of ${delivery.statusDate} at ${delivery.statusTime})`
        });
    } catch (error) {
        console.error("Error in GET /deliverystatus:", error);
        res.status(500).json({ message: "Invalid ID format or server error." });
    }
});


app.put("/deliverystatus/:id", async (req, res) => {
    // To update the status of a specific delivery
    const { id } = req.params;
    const { statusDate, statusTime, statusMessage, courierConfirmed, courierConfirmDate } = req.body;

    try {
        const database = client.db("GenCore");
        const deliveryCollection = database.collection("Delivery");

        const updatedFields = {};
        if (statusDate) updatedFields.statusDate = statusDate;
        if (statusTime) updatedFields.statusTime = statusTime;
        if (statusMessage) updatedFields.statusMessage = statusMessage;
        if (courierConfirmed !== undefined) updatedFields.courierConfirmed = Boolean(courierConfirmed);
        if (courierConfirmDate) updatedFields.courierConfirmDate = courierConfirmDate;

        const result = await deliveryCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: updatedFields }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: "Delivery record not found." });
        }

        res.status(200).json({ message: "Delivery tracking status updated successfully!" });
    } catch (error) {
        console.error("Error in PUT /deliverystatus:", error);
        res.status(500).json({ message: "Internal server error updating delivery." });
    }
});


app.post("/deliveryconfirm", async (req, res) => {
    // To save the courier's confirmation of an order
    const { orderNumber, itemsCount, statusMessage } = req.body;

    try {
        const database = client.db("GenCore");
        const deliveryCollection = database.collection("Delivery");

        const newDeliveryRecord = {
            courierConfirmed: true,
            itemsCount: parseInt(itemsCount) || 1,
            orderNumber,
            courierConfirmDate: "07/06/2026",
            statusDate: "07/06/2026",
            statusTime: "15:30",
            statusMessage: statusMessage || "Order has been processed and is ready for courier collection."
        };

        const result = await deliveryCollection.insertOne(newDeliveryRecord);
        res.status(201).json({ 
            message: "Delivery successfully initialized and confirmed by courier! Yayy!", 
            deliveryId: result.insertedId 
        });
    } catch (error) {
        console.error("Error in POST /deliveryconfirm:", error);
        res.status(500).json({ message: "Internal server error." });
    }
});

//CUSTOMER SUPPORT AND FEEDBACK

app.post("/usermessage", async (req, res) => {
    // To create a new message
    const { userUsername, messageContent } = req.body;

    try {
        const database = client.db("GenCore");
        const feedbackCollection = database.collection("Feedback");

        const newFeedback = {
            userUsername,
            messageDate: "07/06/2026", 
            messageTime: "15:53",
            messageContent
        };

        const result = await feedbackCollection.insertOne(newFeedback);
        res.status(201).json({ 
            message: "Message created successfully!", 
            messageId: result.insertedId 
        });
    } catch (error) {
        console.error("Error in POST /usermessage:", error);
        res.status(500).json({ message: "Internal server error." });
    }
});


app.put("/usermessage/:id", async (req, res) => {
    // To update a specific message

    const { id } = req.params;
    const { messageContent } = req.body;

    try {
        const database = client.db("GenCore");
        const feedbackCollection = database.collection("Feedback");

        const result = await feedbackCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { messageContent: messageContent } }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: "Message not found." });
        }

        res.status(200).json({ message: "Message content updated successfully!" });
    } catch (error) {
        console.error("Error in PUT /usermessage:", error);
        res.status(500).json({ message: "Internal server error." });
    }
});


app.get("/usermessage/:id", async (req, res) => {
    // To read a specific message
    const { id } = req.params;

    try {
        const database = client.db("GenCore");
        const feedbackCollection = database.collection("Feedback");

        const messageRecord = await feedbackCollection.findOne({ _id: new ObjectId(id) });

        if (!messageRecord) {
            return res.status(404).json({ message: "Message not found." });
        }

        res.status(200).json(messageRecord);
    } catch (error) {
        console.error("Error in GET /usermessage:", error);
        res.status(500).json({ message: "Invalid ID or server error." });
    }
});


app.delete("/usermessage/:id", async (req, res) => {
    // To delete a specific message
    const { id } = req.params;

    try {
        const database = client.db("GenCore");
        const feedbackCollection = database.collection("Feedback");

        const result = await feedbackCollection.deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: "Message not found." });
        }

        res.status(200).json({ message: "Message permanently deleted from records." });
    } catch (error) {
        console.error("Error in DELETE /usermessage:", error);
        res.status(500).json({ message: "Invalid ID or server error." });
    }
});

app.listen(PORT, async () => {
    await connectToMongo();
    console.log(`Server is running on http://localhost:${PORT}`);
})


































































// If you reached the end of this code leave 3 exclamation marks (!!!) when you comment on my work ^^ thank youu

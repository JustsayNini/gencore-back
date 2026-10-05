const chai = require('chai');
const chaiHttp = require('chai-http');
const expect = chai.expect;

chai.use(chaiHttp);

const serverUrl = 'http://localhost:3000';

describe('Gencore API Comprehensive Test Suite', function() {
    let generatedOrderNumber;
    let createdProductId;
    let createdMessageId;
    let testUserEmail = `test_${Date.now()}@example.com`;

   
    describe('User Endpoints', function() {
        it('POST /userinformation should register a new user successfully', function(done) {
            chai.request(serverUrl)
                .post('/userinformation')
                .send({
                    userEmail: testUserEmail,
                    userFirstName: 'Andy',
                    userSurname: 'Tester',
                    userUsername: 'andy_test',
                    userPassword: 'SecurePassword123'
                })
                .end((err, res) => {
                    expect(err).to.be.null;
                    expect(res).to.have.status(201);
                    expect(res.body).to.have.property('message', 'User registered successfully!');
                    done();
                });
        });

        it('POST /usersession should log in the registered user', function(done) {
            chai.request(serverUrl)
                .post('/usersession')
                .send({
                    userEmail: testUserEmail,
                    userPassword: 'SecurePassword123'
                })
                .end((err, res) => {
                    expect(err).to.be.null;
                    expect(res).to.have.status(200);
                    expect(res.body).to.have.property('message', 'Login successful!');
                    expect(res.body.user).to.have.property('email', testUserEmail);
                    done();
                });
        });

        it('POST /usersession should fail with invalid credentials', function(done) {
            chai.request(serverUrl)
                .post('/usersession')
                .send({
                    userEmail: testUserEmail,
                    userPassword: 'WrongPassword'
                })
                .end((err, res) => {
                    expect(res).to.have.status(401);
                    expect(res.body).to.have.property('message', 'Invalid email or password.');
                    done();
                });
        });
    });

 
    describe('Product Catalog Endpoints', function() {
        it('GET /productinfo should handle queries and return 404 if no products match', function(done) {
            chai.request(serverUrl)
                .get('/productinfo?search=NonExistentDeviceXYZ')
                .end((err, res) => {
                    expect(res).to.have.status(404);
                    expect(res.body).to.have.property('message', 'No matching devices found.');
                    done();
                });
        });

        it('GET /productinfo/:id should return 404 for a non-existent product ID', function(done) {
            chai.request(serverUrl)
                .get('/productinfo/650123456789012345678901')
                .end((err, res) => {
                    expect(res).to.have.status(404);
                    expect(res.body).to.have.property('message', 'Product not found.');
                    done();
                });
        });
    });

  
    describe('Cart and Order Endpoints', function() {
        it('POST /addcart should successfully add an item to the cart', function(done) {
            chai.request(serverUrl)
                .post('/addcart')
                .send({
                    deviceName: 'Gaming Laptop X',
                    devicePrice: 15000,
                    itemsCount: 1,
                    itemsTotalPrice: 15000
                })
                .end((err, res) => {
                    expect(err).to.be.null;
                    expect(res).to.have.status(201);
                    expect(res.body).to.have.property('message', 'Item successfully added to cart!');
                    expect(res.body).to.have.property('cartItemId');
                    done();
                });
        });

        it('POST /ordernumber should create a new order and return an order number', function(done) {
            chai.request(serverUrl)
                .post('/ordernumber')
                .send({ userEmail: testUserEmail })
                .end((err, res) => {
                    expect(err).to.be.null;
                    expect(res).to.have.status(200);
                    expect(res.body).to.have.property('orderNumber');
                    expect(res.body).to.have.property('message', 'Order created successfully!');
                    
                    generatedOrderNumber = res.body.orderNumber;
                    done();
                });
        });

        it('GET /orders should retrieve an array of all orders', function(done) {
            chai.request(serverUrl)
                .get('/orders')
                .end((err, res) => {
                    expect(err).to.be.null;
                    expect(res).to.have.status(200);
                    expect(res.body).to.be.an('array');
                    done();
                });
        });
    });

   
    describe('Delivery Endpoints', function() {
        it('POST /deliveryconfirm should initialize a delivery record from courier', function(done) {
            chai.request(serverUrl)
                .post('/deliveryconfirm')
                .send({
                    orderNumber: generatedOrderNumber || 'ORD-999999',
                    itemsCount: 1,
                    statusMessage: 'Package dispatched for testing'
                })
                .end((err, res) => {
                    expect(err).to.be.null;
                    expect(res).to.have.status(201);
                    expect(res.body).to.have.property('message');
                    expect(res.body).to.have.property('deliveryId');
                    done();
                });
        });

        it('GET /deliveryinfo/:id should return 404 for a fake delivery ID', function(done) {
            chai.request(serverUrl)
                .get('/deliveryinfo/650123456789012345678901')
                .end((err, res) => {
                    expect(res).to.have.status(404);
                    expect(res.body).to.have.property('message', 'Delivery record not found.');
                    done();
                });
        });
    });

   
    describe('Customer Support Endpoints', function() {
        it('POST /usermessage should create a new support message', function(done) {
            chai.request(serverUrl)
                .post('/usermessage')
                .send({
                    userUsername: 'andy_test',
                    messageContent: 'Where is my order confirmation?'
                })
                .end((err, res) => {
                    expect(err).to.be.null;
                    expect(res).to.have.status(201);
                    expect(res.body).to.have.property('message', 'Message created successfully!');
                    expect(res.body).to.have.property('messageId');
                    
                    createdMessageId = res.body.messageId;
                    done();
                });
        });

        it('GET /usermessage/:id should retrieve the specific support message', function(done) {
            
            if (!createdMessageId) return done();

            chai.request(serverUrl)
                .get(`/usermessage/${createdMessageId}`)
                .end((err, res) => {
                    expect(err).to.be.null;
                    expect(res).to.have.status(200);
                    expect(res.body).to.have.property('userUsername', 'andy_test');
                    expect(res.body).to.have.property('messageContent', 'Where is my order confirmation?');
                    done();
                });
        });
    });
});
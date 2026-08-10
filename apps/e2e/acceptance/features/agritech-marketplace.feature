Feature: AgriTech marketplace operations protect every actor

  @REQ-AGRITECH-PARTNER-007
  Rule: Only approved organizations can trade

    @SCN-AGRITECH-PARTNER-01
    Scenario: A pending buyer cannot reserve produce
      Given a pending AgriTech buyer
      When the buyer's marketplace permission is evaluated
      Then the buyer is blocked from marketplace trading

    @SCN-AGRITECH-PARTNER-02
    Scenario: An approved buyer can trade
      Given an approved AgriTech buyer
      When the buyer's marketplace permission is evaluated
      Then the buyer is allowed to trade

  @REQ-AGRITECH-OUTPUT-008
  Rule: Produce reservations never oversell a listing

    @SCN-AGRITECH-OUTPUT-01
    Scenario: A buyer reserves an available quantity
      Given an active produce listing with 100 kilograms available
      When the buyer requests 25 kilograms
      Then the produce reservation is allowed

    @SCN-AGRITECH-OUTPUT-02
    Scenario: A buyer requests more than remains
      Given an active produce listing with 20 kilograms available
      When the buyer requests 25 kilograms
      Then the produce reservation is rejected

  @REQ-AGRITECH-FULFILLMENT-010
  Rule: Delivery completion requires evidence

    @SCN-AGRITECH-FULFILLMENT-01
    Scenario: A field agent cannot complete delivery without proof
      Given an in-transit AgriTech delivery without proof
      When the field agent attempts to complete the delivery
      Then delivery completion is rejected

    @SCN-AGRITECH-FULFILLMENT-02
    Scenario: A field agent completes delivery with proof
      Given an in-transit AgriTech delivery with proof
      When the field agent attempts to complete the delivery
      Then delivery completion is allowed

  @REQ-AGRITECH-MARKETPLACE-016
  Rule: DehqonHub commercial journeys remain seller isolated and party owned

    @SCN-AGRITECH-MARKETPLACE-01
    Scenario: Product identity derives separate seller carts
      Given a verified DehqonHub buyer and products from sellers "seller-a" and "seller-b"
      When the buyer adds both products using only product identity and quantity
      Then two open carts persist with one cart for each product seller

    @SCN-AGRITECH-MARKETPLACE-02
    Scenario: Checkout persists reviewable commercial terms
      Given a verified DehqonHub buyer has an open seller cart
      When the buyer confirms pickup and checks out the cart
      Then the cart closes and the returned draft contract persists its parties, lines, amount, and delivery terms

    @SCN-AGRITECH-MARKETPLACE-03
    Scenario: Choosing an offer persists the selected contract
      Given a verified buyer owns an open request with an offer from a verified seller
      When the buyer chooses that offer
      Then the request and offer are selected and one matching draft contract is returned for review

    @SCN-AGRITECH-MARKETPLACE-04
    Scenario: Buyer and seller consent remain party specific
      Given a verified buyer and seller have a draft DehqonHub contract
      When the buyer records their contract consent
      Then only buyer consent is persisted and the contract awaits the seller
      When the seller records their contract consent
      Then both party consents persist and the contract becomes active

    @REQ-AGRITECH-PARTNER-007 @SCN-AGRITECH-MARKETPLACE-05
    Scenario: Verification does not replace organization approval
      Given a verified DehqonHub buyer without an approved buyer organization can discover an active product
      When the unapproved buyer attempts to add the product to a cart
      Then the cart addition is denied without a cart or contract

    @SCN-AGRITECH-MARKETPLACE-06
    Scenario: An unverified user cannot create a seller cart
      Given an unverified DehqonHub user can discover an active product
      When the unverified user attempts to add the product to a cart
      Then the cart mutation is denied and no seller cart is persisted

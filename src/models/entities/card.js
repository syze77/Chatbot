const sequelize = require ('src/models/connections/connection.js')
const {DataTypes} = require ('sequelize');

const Card = sequelize.define(
    'Card',
    {
        id: {
            type: DataTypes.BIGINT,
            autoIncrement: true,
            primaryKey: true,
        },
        link: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        status: {
            type: DataTypes.ENUM('PENDING', 'COMPLETED'),
            allowNull: false,
            defaultValue: 'PENDING',
        },
    },
);

Card.associate = (models) => {
    Card.hasOne(models.Call);
};

module.exports = Card;
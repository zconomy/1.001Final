import pandas as pd
import numpy as np
# import matplotlib.pyplot as plt
from sklearn import linear_model

def main():
    # inport data from "dataPrc.py"
    data_for_model = pd.read_csv('data.csv')
    data_for_model = data_for_model.drop(['time'], axis=1)
    data_for_model = data_for_model.drop(['device'], axis=1)
    data_for_model = data_for_model.drop(['date'], axis=1)
    data_for_model = data_for_model.drop(['timeDiff'], axis=1)
    data_for_model = data_for_model.drop(['segment'], axis=1)
    data_for_model = data_for_model.drop(['Unnamed: 0'], axis=1)

    # split data set
    np.random.seed(65535)
    msk = np.random.rand(len(data_for_model)) < 0.8
    data_train = data_for_model[msk]
    data_test = data_for_model[~msk]

    slope_train = data_train['slope']
    data_train = data_train.drop(['slope'], axis=1)

    slope_test = data_test['slope']
    data_test = data_test.drop(['slope'], axis=1)

    # build the linear model, slope prediction "per hour"
    lr = linear_model.LinearRegression()
    model = lr.fit(data_train, np.multiply(60,slope_train))
    print(f"R^2 is: {model.score(data_test,np.multiply(60,slope_test))}")
    print("Coefficients: \n", lr.coef_)
    print("Intercept: \n", lr.intercept_)
    print("names: \n", lr.feature_names_in_)

    # run and save the prediction
    pred_for_model = pd.read_csv('data.csv')
    data_for_model = data_for_model.drop(['slope'], axis=1)
    pred_for_model['pred_slope'] = model.predict(data_for_model)
    pred_for_model.to_csv('predictions.csv', index=-False)

if __name__ == "__main__":
    main()

